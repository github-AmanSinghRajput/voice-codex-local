import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFileExplanation } from './file-explanation';

test('buildFileExplanation matches task by filename', () => {
  const result = buildFileExplanation(
    'src/app/layout.tsx',
    ['Update layout.tsx to add the ClarityProvider wrapper', 'Fix env validation'],
    ''
  );
  assert.equal(result, 'Update layout.tsx to add the ClarityProvider wrapper');
});

test('buildFileExplanation matches task by directory name', () => {
  const result = buildFileExplanation(
    'src/components/providers/ClarityProvider.tsx',
    ['Add a new analytics provider component', 'Wire providers into layout'],
    ''
  );
  assert.equal(result, 'Wire providers into layout');
});

test('buildFileExplanation falls back to diff heuristic for imports', () => {
  const diff = `@@ -1,4 +1,5 @@
 import { ThemeProvider } from '@components/theme-provider'
+import { ClarityProvider } from '@components/providers/ClarityProvider'
 import { StoreProvider } from '@store/StoreProvider'
 import { AuthInitializer } from '@components/providers/AuthInitializer'`;

  const result = buildFileExplanation('src/app/layout.tsx', [], diff);
  assert.ok(result.includes('ClarityProvider'), `Expected import mention, got: ${result}`);
});

test('buildFileExplanation falls back to diff heuristic for function additions', () => {
  const diff = `@@ -10,3 +10,8 @@
 const existing = true;
+function handleSubmit(data: FormData) {
+  validate(data);
+  submit(data);
+}
+`;

  const result = buildFileExplanation('src/form.ts', [], diff);
  assert.ok(result.includes('handleSubmit'), `Expected function mention, got: ${result}`);
});

test('buildFileExplanation falls back to stats when no heuristic matches', () => {
  const diff = `@@ -1,3 +1,5 @@
 aaa
+bbb
+ccc
 ddd`;

  const result = buildFileExplanation('src/data.json', [], diff);
  assert.ok(result.includes('+2'), `Expected stats, got: ${result}`);
});

test('buildFileExplanation handles empty diff and no tasks', () => {
  const result = buildFileExplanation('src/unknown.ts', [], '');
  assert.ok(result.length > 0, 'Should return something even with no data');
});

test('buildFileExplanation handles pure deletion diff', () => {
  const diff = `@@ -1,5 +1,2 @@
 keep
-removed line one
-removed line two
-removed line three
 keep`;

  const result = buildFileExplanation('src/cleanup.ts', [], diff);
  assert.ok(result.includes('-3') || result.includes('Removed'), `Expected deletion info, got: ${result}`);
});
