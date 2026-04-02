import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFileTree } from './file-tree';

test('buildFileTree returns a single file at root level', () => {
  const tree = buildFileTree(['package.json']);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'package.json');
  assert.equal(tree[0].path, 'package.json');
  assert.equal(tree[0].isDirectory, false);
  assert.equal(tree[0].children.length, 0);
});

test('buildFileTree groups files under a common directory', () => {
  const tree = buildFileTree(['src/a.ts', 'src/b.ts']);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'src');
  assert.equal(tree[0].isDirectory, true);
  assert.equal(tree[0].children.length, 2);
  assert.equal(tree[0].children[0].name, 'a.ts');
  assert.equal(tree[0].children[1].name, 'b.ts');
});

test('buildFileTree collapses single-child directories', () => {
  const tree = buildFileTree(['src/app/layout.tsx']);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'src/app');
  assert.equal(tree[0].isDirectory, true);
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].name, 'layout.tsx');
});

test('buildFileTree does not collapse directories with multiple children', () => {
  const tree = buildFileTree([
    'src/app/layout.tsx',
    'src/config/env.ts'
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'src');
  assert.equal(tree[0].isDirectory, true);
  assert.equal(tree[0].children.length, 2);
  const appDir = tree[0].children.find((c) => c.name === 'app');
  const configDir = tree[0].children.find((c) => c.name === 'config');
  assert.ok(appDir);
  assert.ok(configDir);
  assert.equal(appDir.children[0].name, 'layout.tsx');
  assert.equal(configDir.children[0].name, 'env.ts');
});

test('buildFileTree sorts directories before files', () => {
  const tree = buildFileTree([
    'README.md',
    'src/index.ts',
    '.env.example'
  ]);
  const names = tree.map((n) => n.name);
  assert.equal(names[0], 'src');
  assert.equal(names[1], '.env.example');
  assert.equal(names[2], 'README.md');
});

test('buildFileTree handles deeply nested single-child collapse', () => {
  const tree = buildFileTree([
    'src/features/auth/auth.service.ts',
    'src/features/auth/auth.test.ts'
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'src/features/auth');
  assert.equal(tree[0].children.length, 2);
});

test('buildFileTree handles empty input', () => {
  const tree = buildFileTree([]);
  assert.equal(tree.length, 0);
});

test('buildFileTree handles mixed root and nested files', () => {
  const tree = buildFileTree([
    '.env.example',
    'package.json',
    'src/app/layout.tsx',
    'src/components/providers/ClarityProvider.tsx',
    'src/config/env.ts'
  ]);
  const rootNames = tree.map((n) => n.name);
  assert.ok(rootNames.includes('src'));
  assert.ok(rootNames.includes('.env.example'));
  assert.ok(rootNames.includes('package.json'));
  const srcNode = tree.find((n) => n.name === 'src');
  assert.ok(srcNode);
  assert.ok(srcNode.isDirectory);
});
