export function splitSpeechIntoChunks(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const sentenceParts = normalized
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);

  return sentenceParts.flatMap((chunk) => splitLongChunk(chunk));
}

function splitLongChunk(chunk: string) {
  if (chunk.length <= 220) {
    return [chunk];
  }

  const parts = chunk.split(/,\s+/);
  if (parts.length === 1) {
    return splitByWords(chunk, 220);
  }

  const result: string[] = [];
  let current = '';

  for (const part of parts) {
    const next = current ? `${current}, ${part}` : part;
    if (next.length <= 220) {
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

  return result.flatMap((part) => (part.length <= 220 ? [part] : splitByWords(part, 220)));
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
