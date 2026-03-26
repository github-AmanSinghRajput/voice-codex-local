import assert from 'node:assert/strict';
import test from 'node:test';
import { downmixChannels, encodePcm16Wav, mergePcmChunks } from './pcm-audio.js';

test('downmixChannels averages multiple channels into mono', () => {
  const mono = downmixChannels([
    new Float32Array([1, -1, 0.5]),
    new Float32Array([0, 0.5, -0.5])
  ]);

  assert.deepEqual(Array.from(mono), [0.5, -0.25, 0]);
});

test('mergePcmChunks preserves sample order', () => {
  const merged = mergePcmChunks([
    new Float32Array([0.1, 0.2]),
    new Float32Array([0.3]),
    new Float32Array([-0.4, -0.5])
  ]);

  assert.equal(merged.length, 5);
  assert.ok(Math.abs(merged[0]! - 0.1) < 1e-6);
  assert.ok(Math.abs(merged[1]! - 0.2) < 1e-6);
  assert.ok(Math.abs(merged[2]! - 0.3) < 1e-6);
  assert.ok(Math.abs(merged[3]! + 0.4) < 1e-6);
  assert.ok(Math.abs(merged[4]! + 0.5) < 1e-6);
});

test('encodePcm16Wav writes a mono 16-bit wav header and payload', () => {
  const wavBytes = encodePcm16Wav(new Float32Array([0, 1, -1]), 16000);
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);

  assert.equal(readAscii(wavBytes, 0, 4), 'RIFF');
  assert.equal(readAscii(wavBytes, 8, 4), 'WAVE');
  assert.equal(readAscii(wavBytes, 12, 4), 'fmt ');
  assert.equal(readAscii(wavBytes, 36, 4), 'data');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(wavBytes.byteLength, 50);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32768);
});

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
