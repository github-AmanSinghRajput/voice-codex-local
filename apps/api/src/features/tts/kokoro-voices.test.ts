import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveKokoroVoiceLangCode, toKokoroVoiceOption } from './kokoro-voices.js';

test('deriveKokoroVoiceLangCode uses the voice prefix language code', () => {
  assert.equal(deriveKokoroVoiceLangCode('af_heart', 'a'), 'a');
  assert.equal(deriveKokoroVoiceLangCode('bf_bella', 'a'), 'b');
  assert.equal(deriveKokoroVoiceLangCode('pm_alex', 'a'), 'p');
});

test('toKokoroVoiceOption formats readable voice labels', () => {
  assert.deepEqual(toKokoroVoiceOption('af_heart'), {
    id: 'af_heart',
    name: 'Heart',
    language: 'English (US) Female',
    quality: 'default'
  });

  assert.deepEqual(toKokoroVoiceOption('pm_alex'), {
    id: 'pm_alex',
    name: 'Alex',
    language: 'Portuguese Male',
    quality: 'default'
  });
});
