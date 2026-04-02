import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSpeechIntoChunks } from './speech-chunks.js';

test('splitSpeechIntoChunks preserves sentence boundaries for normal replies', () => {
  const chunks = splitSpeechIntoChunks(
    'I updated the API route. I also tightened the validation. Review the diff when you are ready.'
  );

  assert.deepEqual(chunks, [
    'I updated the API route. I also tightened the validation. Review the diff when you are ready.'
  ]);
});

test('splitSpeechIntoChunks merges short sentences for smoother playback', () => {
  const chunks = splitSpeechIntoChunks(
    'The patch is ready. One more thing. Check the tests.'
  );

  assert.deepEqual(chunks, ['The patch is ready. One more thing. Check the tests.']);
});

test('splitSpeechIntoChunks splits long chunks into bounded pieces', () => {
  const chunks = splitSpeechIntoChunks(
    'This change updates the workspace selector, improves validation around missing project roots, adds clearer error copy for invalid paths, and keeps the write-access toggle consistent with the latest backend state so the onboarding flow does not drift from the actual workspace configuration.'
  );

  assert.ok(chunks.length >= 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 320);
  }
});
