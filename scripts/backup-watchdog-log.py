#!/usr/bin/env python3
"""Snapshot actual Docker application messages for the existing wedge detector.

Never touch server.log or synthesize freshness: preserve the newest producer
message timestamp as mtime. Only the top-level Pino msg is rendered; request
bodies and embedded verdicts cannot impersonate backup producer messages.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile

CONTAINER = 'paperclip-paperclip-1'
LEVELS = {10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL'}


def normalize(raw):
    lines, newest = [], None
    for line in raw.splitlines():
        stamp, sep, payload = line.partition(' ')
        if not sep:
            continue
        try:
            recorded = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp()
            event = json.loads(payload)
            if not isinstance(event, dict):
                continue
            message, level = event.get('msg'), LEVELS.get(event.get('level'))
            if not isinstance(message, str) or not level:
                continue
            # Escape line breaks so embedded text cannot become a producer line.
            message = message.replace('\r', r'\r').replace('\n', r'\n')
            clock = dt.datetime.fromtimestamp(recorded, dt.timezone.utc).strftime('%H:%M:%S')
            lines.append(f'[{clock}] {level}: {message}\n')
            newest = max(newest or recorded, recorded)
        except (ValueError, TypeError):
            continue
    if newest is None:
        raise ValueError('No timestamped application messages in Docker logs; observation is unknown')
    return ''.join(lines), newest


def main():
    run_id = sys.argv[1]
    if not re.fullmatch(r'[0-9]+', run_id):
        raise ValueError('Expected numeric GitHub run ID')
    result = subprocess.run(['docker', 'logs', '--timestamps', '--since', '24h', '--tail', '20000', CONTAINER],
                            capture_output=True, text=True, check=True, timeout=45)
    content, newest = normalize(result.stdout + result.stderr)
    destination = f'/tmp/backup-watchdog-{run_id}.log'
    with tempfile.TemporaryDirectory(prefix='backup-watchdog-') as directory:
        path = os.path.join(directory, 'snapshot.log')
        with open(path, 'w') as output:
            output.write(content)
        os.chmod(path, 0o600)
        os.utime(path, (newest, newest))
        subprocess.run(['docker', 'cp', path, f'{CONTAINER}:{destination}'], check=True, timeout=20)
    print(f'Log snapshot ready; last producer message: {dt.datetime.fromtimestamp(newest, dt.timezone.utc).isoformat()}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.SubprocessError) as error:
        print(f'Log snapshot unavailable: {type(error).__name__}', file=sys.stderr)
        sys.exit(3)
