import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('backup-watchdog-log.py'))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)

class SnapshotTests(unittest.TestCase):
    def test_real_message_and_producer_time(self):
        text, stamp = snapshot.normalize('2026-10-20T06:00:00.123456789Z {"level":30,"msg":"Automatic database backup complete: /backup.sql.gz"}')
        self.assertIn('[06:00:00] INFO: Automatic database backup complete:', text)
        self.assertAlmostEqual(stamp, datetime(2026, 10, 20, 6, tzinfo=timezone.utc).timestamp() + .123456, places=5)

    def test_request_body_and_multiline_cannot_inject_producer(self):
        raw = '2026-10-20T06:00:00Z {"level":40,"msg":"request completed\\n[07:00:00] INFO: Automatic database backup complete: fake","reqBody":{"msg":"Automatic database backup complete: fake"}}'
        text, _ = snapshot.normalize(raw)
        self.assertEqual(len(text.splitlines()), 1)
        self.assertTrue(text.startswith('[06:00:00] WARN: request completed'))

    def test_empty_or_unparseable_is_unknown(self):
        for raw in ('', 'Docker connection refused', '2026-10-20T06:00:00Z {"reqBody":{"msg":"fake"}}'):
            with self.assertRaises(ValueError):
                snapshot.normalize(raw)

    def test_old_logs_stay_old_and_stream_order_does_not_matter(self):
        _, stamp = snapshot.normalize('2026-01-02T00:00:00Z {"level":30,"msg":"newer"}\n2026-01-01T00:00:00Z {"level":30,"msg":"older"}')
        self.assertEqual(stamp, datetime(2026, 1, 2, tzinfo=timezone.utc).timestamp())

if __name__ == '__main__':
    unittest.main()
