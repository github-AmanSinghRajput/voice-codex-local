const MAX_CHUNK_LENGTH = 320;
const TARGET_CHUNK_LENGTH = 210;

export function splitSpeechIntoChunks(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const sentenceParts = normalized
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => splitLongChunk(part));

  const merged: string[] = [];
  for (const chunk of sentenceParts) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.length < TARGET_CHUNK_LENGTH &&
      `${previous} ${chunk}`.length <= MAX_CHUNK_LENGTH
    ) {
      merged[merged.length - 1] = `${previous} ${chunk}`.trim();
      continue;
    }

    merged.push(chunk);
  }

  return merged;
}

function splitLongChunk(chunk: string) {
  if (chunk.length <= MAX_CHUNK_LENGTH) {
    return [chunk];
  }

  const parts = chunk.split(/(?<=[,;:])\s+/);
  if (parts.length === 1) {
    return splitByWords(chunk, MAX_CHUNK_LENGTH);
  }

  const result: string[] = [];
  let current = '';

  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length <= MAX_CHUNK_LENGTH) {
      current = next;
      continue;
    }

    if (current) {
      result.push(current);
    }
    current = part;
  }

  if (current) {
    result.push(current);
  }

  return result.flatMap((part) => (part.length <= MAX_CHUNK_LENGTH ? [part] : splitByWords(part, MAX_CHUNK_LENGTH)));
}

function splitByWords(text: string, maxLength: number) {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
