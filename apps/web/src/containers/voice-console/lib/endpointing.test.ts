import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTimeDomainRms,
  desktopVadConfig,
  getEffectiveEndpointDelayMs,
  smoothRms
} from './endpointing.js';

test('computeTimeDomainRms returns zero for silence', () => {
  const samples = new Uint8Array(32).fill(128);

  assert.equal(computeTimeDomainRms(samples), 0);
});

test('computeTimeDomainRms detects non-zero energy', () => {
  const samples = Uint8Array.from([128, 160, 128, 96]);

  assert.ok(computeTimeDomainRms(samples) > 0.1);
});

test('smoothRms eases toward the next sample level', () => {
  const smoothed = smoothRms(0.01, 0.05, 0.5);

  assert.equal(smoothed, 0.03);
});

test('smoothRms uses the first sample when no prior level exists', () => {
  assert.equal(smoothRms(0, desktopVadConfig.startThreshold), desktopVadConfig.startThreshold);
});

test('getEffectiveEndpointDelayMs trims silence windows with a floor', () => {
  assert.equal(getEffectiveEndpointDelayMs(800), 650);
  assert.equal(getEffectiveEndpointDelayMs(500), 450);
});
