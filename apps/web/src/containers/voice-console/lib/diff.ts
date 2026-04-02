import type { DiffHunk, DiffRow, ParsedFileDiff, VoiceState } from './types';

export function pairDiffRows(
  removals: Array<{ lineNumber: number; text: string }>,
  additions: Array<{ lineNumber: number; text: string }>
) {
  const rows: DiffRow[] = [];
  const count = Math.max(removals.length, additions.length);

  for (let index = 0; index < count; index += 1) {
    const removal = removals[index];
    const addition = additions[index];

    rows.push({
      leftLineNumber: removal?.lineNumber ?? null,
      leftText: removal?.text ?? '',
      leftKind: removal ? 'remove' : 'empty',
      rightLineNumber: addition?.lineNumber ?? null,
      rightText: addition?.text ?? '',
      rightKind: addition ? 'add' : 'empty'
    });
  }

  return rows;
}

export function parseDiffRows(diff: string) {
  const lines = diff.split('\n');
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let removals: Array<{ lineNumber: number; text: string }> = [];
  let additions: Array<{ lineNumber: number; text: string }> = [];

  const flushPairs = () => {
    if (removals.length === 0 && additions.length === 0) {
      return;
    }

    rows.push(...pairDiffRows(removals, additions));
    removals = [];
    additions = [];
  };

  for (const line of lines) {
    if (
      !line ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (line.startsWith('@@')) {
      flushPairs();
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      continue;
    }

    if (line.startsWith('-')) {
      removals.push({
        lineNumber: oldLine,
        text: line.slice(1)
      });
      oldLine += 1;
      continue;
    }

    if (line.startsWith('+')) {
      additions.push({
        lineNumber: newLine,
        text: line.slice(1)
      });
      newLine += 1;
      continue;
    }

    flushPairs();
    if (line.startsWith(' ')) {
      rows.push({
        leftLineNumber: oldLine,
        leftText: line.slice(1),
        leftKind: 'context',
        rightLineNumber: newLine,
        rightText: line.slice(1),
        rightKind: 'context'
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  flushPairs();
  return rows;
}

export function parseFileDiff(diff: string): ParsedFileDiff {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let removals: Array<{ lineNumber: number; text: string }> = [];
  let additions: Array<{ lineNumber: number; text: string }> = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  const flushPairs = () => {
    if (removals.length === 0 && additions.length === 0) {
      return;
    }
    if (currentHunk) {
      currentHunk.rows.push(...pairDiffRows(removals, additions));
    }
    removals = [];
    additions = [];
  };

  for (const line of lines) {
    if (
      !line ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (line.startsWith('@@')) {
      flushPairs();
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[3]);
        currentHunk = {
          header: line,
          oldStart: Number(match[1]),
          oldCount: match[2] !== undefined ? Number(match[2]) : 1,
          newStart: Number(match[3]),
          newCount: match[4] !== undefined ? Number(match[4]) : 1,
          contextLabel: (match[5] ?? '').trim(),
          rows: []
        };
        hunks.push(currentHunk);
      }
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('-')) {
      removals.push({ lineNumber: oldLine, text: line.slice(1) });
      oldLine += 1;
      totalDeletions += 1;
      continue;
    }

    if (line.startsWith('+')) {
      additions.push({ lineNumber: newLine, text: line.slice(1) });
      newLine += 1;
      totalAdditions += 1;
      continue;
    }

    flushPairs();
    if (line.startsWith(' ')) {
      currentHunk.rows.push({
        leftLineNumber: oldLine,
        leftText: line.slice(1),
        leftKind: 'context',
        rightLineNumber: newLine,
        rightText: line.slice(1),
        rightKind: 'context'
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  flushPairs();

  return {
    hunks,
    stats: { additions: totalAdditions, deletions: totalDeletions }
  };
}

export function getVoiceStateLabel(voiceState: VoiceState) {
  if (voiceState === 'error') {
    return 'Error';
  }

  if (voiceState === 'listening') {
    return 'Listening';
  }

  if (voiceState === 'thinking') {
    return 'Thinking';
  }

  if (voiceState === 'speaking') {
    return 'Speaking';
  }

  return 'Idle';
}
