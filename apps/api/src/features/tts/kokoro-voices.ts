import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../../config/env.js';
import type { VoiceOption } from '../../types.js';

const KOKORO_CACHE_REPO_DIR = 'models--hexgrad--Kokoro-82M';
const PREFERRED_VOICE_ORDER = ['am_michael', 'af_heart', 'af_bella', 'af_nova', 'af_jessica'] as const;

const LANGUAGE_LABELS: Record<string, string> = {
  a: 'English (US)',
  b: 'English (UK)',
  e: 'Spanish',
  f: 'French',
  h: 'Hindi',
  i: 'Italian',
  j: 'Japanese',
  p: 'Portuguese',
  z: 'Chinese'
};

export async function listAvailableKokoroVoices() {
  const voiceIds = await discoverCachedKokoroVoiceIds();

  if (voiceIds.size === 0 && env.kokoroVoice.trim()) {
    voiceIds.add(env.kokoroVoice.trim());
  }

  const curatedVoiceIds = [
    ...PREFERRED_VOICE_ORDER.filter((voiceId) => voiceIds.has(voiceId)),
    ...[...voiceIds].sort().filter((voiceId) => !PREFERRED_VOICE_ORDER.includes(voiceId as typeof PREFERRED_VOICE_ORDER[number]))
  ].slice(0, 5);

  if (env.kokoroVoice.trim() && !curatedVoiceIds.includes(env.kokoroVoice.trim())) {
    curatedVoiceIds.pop();
    curatedVoiceIds.push(env.kokoroVoice.trim());
  }

  return curatedVoiceIds.map(toKokoroVoiceOption);
}

export function deriveKokoroVoiceLangCode(voiceId: string, fallback = env.kokoroLangCode) {
  const prefix = getVoicePrefix(voiceId);
  const langCode = prefix.charAt(0).toLowerCase();
  return /^[a-z]$/.test(langCode) ? langCode : fallback;
}

export function toKokoroVoiceOption(voiceId: string): VoiceOption {
  const trimmed = voiceId.trim();
  const prefix = getVoicePrefix(trimmed);
  const descriptor = trimmed
    .split('_')
    .slice(1)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .trim();

  const languageLabel = LANGUAGE_LABELS[deriveKokoroVoiceLangCode(trimmed)] ?? 'Unknown language';
  const genderLabel = getVoiceGenderLabel(prefix);

  return {
    id: trimmed,
    name: descriptor ? toTitleCase(descriptor) : trimmed,
    language: genderLabel ? `${languageLabel} ${genderLabel}` : languageLabel,
    quality: PREFERRED_VOICE_ORDER.includes(trimmed as typeof PREFERRED_VOICE_ORDER[number]) ? 'enhanced' : 'default'
  };
}

async function discoverCachedKokoroVoiceIds() {
  const voiceIds = new Set<string>();
  const cacheRoots = [
    path.join(os.homedir(), '.cache', 'huggingface', 'hub', KOKORO_CACHE_REPO_DIR),
    path.join(os.homedir(), 'Library', 'Caches', 'huggingface', 'hub', KOKORO_CACHE_REPO_DIR)
  ];

  for (const cacheRoot of cacheRoots) {
    await collectVoiceIds(cacheRoot, voiceIds);
  }

  return voiceIds;
}

async function collectVoiceIds(rootDir: string, voiceIds: Set<string>) {
  let entries: string[];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return;
  }

  for (const name of entries) {
    const nextPath = path.join(rootDir, name);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(nextPath);
    } catch {
      continue;
    }
    const entry = { name, isDirectory: () => stat.isDirectory(), isFile: () => stat.isFile() };
    if (entry.isDirectory()) {
      await collectVoiceIds(nextPath, voiceIds);
      continue;
    }

    if (entry.isFile() && path.extname(entry.name) === '.pt' && path.basename(path.dirname(nextPath)) === 'voices') {
      voiceIds.add(path.basename(entry.name, '.pt'));
    }
  }
}

function getVoicePrefix(voiceId: string) {
  return voiceId.trim().split(/[_-]/)[0] ?? '';
}

function getVoiceGenderLabel(prefix: string) {
  const genderCode = prefix.charAt(1).toLowerCase();
  if (genderCode === 'f') {
    return 'Female';
  }

  if (genderCode === 'm') {
    return 'Male';
  }

  return '';
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
