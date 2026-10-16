import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates, sha256, slugBase, fetchArchive } from './de-brief-ledger.mjs';

const archive = [{ id: 210938918, title: 'Waarom Brunello, Chianti en Vino Nobile', slug: 'waarom-brunello-chianti-en-vino-nobile', post_date: '2026-08-12' }];

test('zelfde titel in archief = duplicaat (de 02-10-herhaling)', () => {
  assert.equal(findDuplicates({ title: 'waarom brunello, chianti en vino nobile', hash: 'x' }, [], archive).length, 1);
});
test('herhaalde slug met -923 valt op slug-basis', () => {
  assert.equal(slugBase('waarom-brunello-chianti-en-vino-nobile-923'), 'waarom-brunello-chianti-en-vino-nobile');
  assert.equal(findDuplicates({ title: 'Andere titel', hash: 'x', slug: 'waarom-brunello-chianti-en-vino-nobile-923' }, [], archive).length, 1);
});
test('zelfde inhoudshash in ledger = duplicaat, ook met nieuwe titel', () => {
  const ledger = [{ issue_id: 'LAT-2622', post_id: '1', title: 'Moezel', content_sha256: sha256('body\n') }];
  assert.equal(findDuplicates({ title: 'Moezel v2', hash: sha256('body') }, ledger, []).length, 1);
});
test('nieuwe editie is veilig', () => {
  assert.deepEqual(findDuplicates({ title: 'De Moezel zonder stoffige reputatie', hash: 'y' }, [], archive), []);
});
test('archief onbereikbaar faalt luid', async () => {
  await assert.rejects(fetchArchive(async () => ({ ok: false, status: 503 })), /503/);
});
