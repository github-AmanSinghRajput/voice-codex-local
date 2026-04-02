import test from 'node:test';
import assert from 'node:assert/strict';
import { describeClaudeActivity } from '../../claude-client.js';

const cwd = '/Users/dev/project';

test('describeClaudeActivity returns reading label for Read tool', () => {
  const result = describeClaudeActivity('Read', { file_path: '/Users/dev/project/src/index.ts' }, cwd);
  assert.equal(result, 'Reading src/index.ts');
});

test('describeClaudeActivity returns editing label for Edit tool', () => {
  const result = describeClaudeActivity('Edit', { file_path: '/Users/dev/project/src/app.ts' }, cwd);
  assert.equal(result, 'Editing src/app.ts');
});

test('describeClaudeActivity returns writing label for Write tool', () => {
  const result = describeClaudeActivity('Write', { file_path: '/Users/dev/project/src/new-file.ts' }, cwd);
  assert.equal(result, 'Writing src/new-file.ts');
});

test('describeClaudeActivity returns running label for Bash tool', () => {
  const result = describeClaudeActivity('Bash', { command: 'npm run test --workspace @voice-codex/api' }, cwd);
  assert.equal(result, 'Running npm run test');
});

test('describeClaudeActivity returns scanning label for Glob tool', () => {
  const result = describeClaudeActivity('Glob', { pattern: '**/*.tsx' }, cwd);
  assert.equal(result, 'Scanning for **/*.tsx');
});

test('describeClaudeActivity returns searching label for Grep tool', () => {
  const result = describeClaudeActivity('Grep', { pattern: 'handleSubmit' }, cwd);
  assert.equal(result, 'Searching for handleSubmit');
});

test('describeClaudeActivity returns web search label for WebSearch tool', () => {
  const result = describeClaudeActivity('WebSearch', { query: 'react intersection observer' }, cwd);
  assert.equal(result, 'Searching the web for react intersection observer');
});

test('describeClaudeActivity returns fetch label for WebFetch tool', () => {
  const result = describeClaudeActivity('WebFetch', { url: 'https://docs.example.com/api' }, cwd);
  assert.equal(result, 'Fetching docs.example.com');
});

test('describeClaudeActivity returns agent label for Agent tool', () => {
  const result = describeClaudeActivity('Agent', { description: 'explore codebase' }, cwd);
  assert.equal(result, 'Delegating to sub-agent');
});

test('describeClaudeActivity returns generic label for unknown tool', () => {
  const result = describeClaudeActivity('CustomTool', {}, cwd);
  assert.equal(result, 'Using CustomTool');
});

test('describeClaudeActivity shows relative path for files inside project', () => {
  const result = describeClaudeActivity('Read', { file_path: '/Users/dev/project/deep/nested/file.ts' }, cwd);
  assert.equal(result, 'Reading deep/nested/file.ts');
});

test('describeClaudeActivity shows placeholder for files outside project', () => {
  const result = describeClaudeActivity('Read', { file_path: '/etc/passwd' }, cwd);
  assert.equal(result, 'Reading a file outside the project');
});

test('describeClaudeActivity handles relative paths as-is', () => {
  const result = describeClaudeActivity('Read', { file_path: 'src/index.ts' }, cwd);
  assert.equal(result, 'Reading src/index.ts');
});

test('describeClaudeActivity handles empty file_path gracefully', () => {
  const result = describeClaudeActivity('Read', { file_path: '' }, cwd);
  assert.equal(result, 'Reading the workspace');
});

test('describeClaudeActivity handles missing input keys gracefully', () => {
  const result = describeClaudeActivity('Read', {}, cwd);
  assert.equal(result, 'Reading the workspace');
});

test('describeClaudeActivity truncates long bash commands', () => {
  const result = describeClaudeActivity('Bash', { command: 'find . -name "*.ts" -exec grep -l "handleSubmit" {} +' }, cwd);
  assert.equal(result, 'Running find . -name');
});

test('describeClaudeActivity handles Bash with empty command', () => {
  const result = describeClaudeActivity('Bash', { command: '' }, cwd);
  assert.equal(result, 'Running a command');
});
