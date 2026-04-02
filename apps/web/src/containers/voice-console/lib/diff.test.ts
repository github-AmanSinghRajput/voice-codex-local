import assert from 'node:assert/strict';
import test from 'node:test';
import { getVoiceStateLabel, pairDiffRows, parseFileDiff, parseDiffRows } from './diff';

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

test('parseFileDiff parses a single hunk into structured output', () => {
  const result = parseFileDiff(`diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@ export function main() {
 line one
-line two
+line two updated
 line three`);

  assert.equal(result.hunks.length, 1);
  assert.equal(result.hunks[0].oldStart, 1);
  assert.equal(result.hunks[0].oldCount, 3);
  assert.equal(result.hunks[0].newStart, 1);
  assert.equal(result.hunks[0].newCount, 3);
  assert.equal(result.hunks[0].contextLabel, 'export function main() {');
  assert.equal(result.hunks[0].rows.length, 3);
  assert.equal(result.stats.additions, 1);
  assert.equal(result.stats.deletions, 1);
});

test('parseFileDiff parses multiple hunks', () => {
  const result = parseFileDiff(`diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 first
+added line
 second
 third
@@ -10,3 +11,2 @@ function foo() {
 alpha
-removed
 beta`);

  assert.equal(result.hunks.length, 2);
  assert.equal(result.hunks[0].oldStart, 1);
  assert.equal(result.hunks[0].newStart, 1);
  assert.equal(result.hunks[1].oldStart, 10);
  assert.equal(result.hunks[1].newStart, 11);
  assert.equal(result.hunks[1].contextLabel, 'function foo() {');
  assert.equal(result.stats.additions, 1);
  assert.equal(result.stats.deletions, 1);
});

test('parseFileDiff computes gap between hunks', () => {
  const result = parseFileDiff(`diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-old
+new
 context
@@ -20,2 +20,2 @@
-old2
+new2
 context2`);

  assert.equal(result.hunks.length, 2);
  const hunk1End = result.hunks[0].oldStart + result.hunks[0].oldCount;
  const hunk2Start = result.hunks[1].oldStart;
  assert.ok(hunk2Start > hunk1End, 'there should be a gap between hunks');
});

test('parseFileDiff handles empty diff', () => {
  const result = parseFileDiff('');
  assert.equal(result.hunks.length, 0);
  assert.equal(result.stats.additions, 0);
  assert.equal(result.stats.deletions, 0);
});

test('parseFileDiff handles diff with only metadata and no hunks', () => {
  const result = parseFileDiff(`diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts`);

  assert.equal(result.hunks.length, 0);
  assert.equal(result.stats.additions, 0);
  assert.equal(result.stats.deletions, 0);
});

test('parseFileDiff handles hunk header without context label', () => {
  const result = parseFileDiff(`@@ -5,3 +5,4 @@
 line
+added
 line
 line`);

  assert.equal(result.hunks.length, 1);
  assert.equal(result.hunks[0].contextLabel, '');
  assert.equal(result.hunks[0].oldStart, 5);
});
