import assert from 'node:assert/strict';
import test from 'node:test';
import { getVoiceStateLabel, pairDiffRows, parseDiffRows } from './diff';

test('pairDiffRows aligns removals and additions into side-by-side rows', () => {
  const rows = pairDiffRows(
    [
      { lineNumber: 8, text: 'const before = true;' },
      { lineNumber: 9, text: 'return before;' }
    ],
    [{ lineNumber: 8, text: 'const after = true;' }]
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].leftKind, 'remove');
  assert.equal(rows[0].rightKind, 'add');
  assert.equal(rows[1].leftLineNumber, 9);
  assert.equal(rows[1].rightKind, 'empty');
});

test('parseDiffRows keeps context lines and edit lines in order', () => {
  const rows = parseDiffRows(`@@ -1,3 +1,3 @@
 line one
-line two
+line two updated
 line three`);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].leftKind, 'context');
  assert.equal(rows[1].leftText, 'line two');
  assert.equal(rows[1].rightText, 'line two updated');
  assert.equal(rows[2].rightText, 'line three');
});

test('getVoiceStateLabel returns stable UI labels', () => {
  assert.equal(getVoiceStateLabel('idle'), 'Idle');
  assert.equal(getVoiceStateLabel('listening'), 'Listening');
  assert.equal(getVoiceStateLabel('thinking'), 'Thinking');
  assert.equal(getVoiceStateLabel('speaking'), 'Speaking');
  assert.equal(getVoiceStateLabel('error'), 'Error');
});
