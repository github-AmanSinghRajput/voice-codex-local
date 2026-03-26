const ENDPOINTING_TRIM_MS = 150;
const MIN_ENDPOINTING_DELAY_MS = 450;

export const desktopVadConfig = {
  minSpeechMs: 160,
  smoothingFactor: 0.35,
  startThreshold: 0.028,
  sustainThreshold: 0.018
} as const;

export function computeTimeDomainRms(samples: Uint8Array) {
  let sumSquares = 0;

  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / samples.length);
}

export function smoothRms(previous: number, next: number, factor = desktopVadConfig.smoothingFactor) {
  if (previous === 0) {
    return next;
  }

  return previous + (next - previous) * factor;
}

export function getEffectiveEndpointDelayMs(configuredSilenceWindowMs: number) {
  return Math.max(MIN_ENDPOINTING_DELAY_MS, configuredSilenceWindowMs - ENDPOINTING_TRIM_MS);
}
