import { useMemo } from 'react';
import { parseFileDiff } from '../lib/diff';
import type { DiffHunk, DiffRow } from '../lib/types';

interface DiffViewProps {
  filePath: string;
  diff: string;
  mode: 'split' | 'unified';
}

export function DiffView({ filePath, diff, mode }: DiffViewProps) {
  const parsed = useMemo(() => parseFileDiff(diff), [diff]);

  if (parsed.hunks.length === 0) {
    return (
      <div className="diff-empty">
        <span className="metric-label">No diff content available for this file.</span>
      </div>
    );
  }

  return (
    <div className="diff-view-frame">
      {mode === 'split' ? (
        <SplitDiffHeader />
      ) : (
        <UnifiedDiffHeader />
      )}
      <div className={mode === 'split' ? 'diff-split-view' : 'diff-unified-view'}>
        {parsed.hunks.map((hunk, hunkIndex) => (
          <DiffHunkSection
            key={`${filePath}-hunk-${hunkIndex}`}
            filePath={filePath}
            hunk={hunk}
            hunkIndex={hunkIndex}
            previousHunk={hunkIndex > 0 ? parsed.hunks[hunkIndex - 1] : null}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}

function SplitDiffHeader() {
  return (
    <div className="diff-view-topbar">
      <span>Before</span>
      <span>After</span>
    </div>
  );
}

function UnifiedDiffHeader() {
  return (
    <div className="diff-view-topbar diff-view-topbar-unified">
      <span>Unified diff</span>
    </div>
  );
}

interface DiffHunkSectionProps {
  filePath: string;
  hunk: DiffHunk;
  hunkIndex: number;
  previousHunk: DiffHunk | null;
  mode: 'split' | 'unified';
}

function DiffHunkSection({ filePath, hunk, hunkIndex, previousHunk, mode }: DiffHunkSectionProps) {
  const gapSize = computeGap(previousHunk, hunk);

  return (
    <>
      {gapSize > 0 ? (
        <div className="diff-collapsed-separator" role="note">
          <span className="diff-collapsed-icon">&#x22EF;</span>
          <span>{gapSize} unchanged lines omitted between hunks</span>
        </div>
      ) : null}
      <div className="diff-hunk-header">
        <code>{hunk.header}</code>
      </div>
      {mode === 'split'
        ? hunk.rows.map((row, rowIndex) => (
            <SplitDiffRow key={`${filePath}-${hunkIndex}-${rowIndex}`} row={row} />
          ))
        : hunk.rows.map((row, rowIndex) => (
            <UnifiedDiffRow key={`${filePath}-${hunkIndex}-${rowIndex}`} row={row} />
          ))}
    </>
  );
}

function SplitDiffRow({ row }: { row: DiffRow }) {
  return (
    <div className="diff-row-split">
      <div className={`diff-cell ${row.leftKind}`}>
        <span className="diff-line-number">{row.leftLineNumber ?? ''}</span>
        <span className="diff-line-marker">
          {row.leftKind === 'remove' ? '-' : row.leftKind === 'context' ? ' ' : ''}
        </span>
        <code>{row.leftText || ' '}</code>
      </div>
      <div className={`diff-cell ${row.rightKind}`}>
        <span className="diff-line-number">{row.rightLineNumber ?? ''}</span>
        <span className="diff-line-marker">
          {row.rightKind === 'add' ? '+' : row.rightKind === 'context' ? ' ' : ''}
        </span>
        <code>{row.rightText || ' '}</code>
      </div>
    </div>
  );
}

function UnifiedDiffRow({ row }: { row: DiffRow }) {
  if (row.leftKind === 'context') {
    return (
      <div className="diff-row-unified context">
        <span className="diff-line-number">{row.leftLineNumber ?? ''}</span>
        <span className="diff-line-number">{row.rightLineNumber ?? ''}</span>
        <span className="diff-line-marker"> </span>
        <code>{row.leftText || ' '}</code>
      </div>
    );
  }

  return (
    <>
      {row.leftKind === 'remove' ? (
        <div className="diff-row-unified remove">
          <span className="diff-line-number">{row.leftLineNumber ?? ''}</span>
          <span className="diff-line-number" />
          <span className="diff-line-marker">-</span>
          <code>{row.leftText || ' '}</code>
        </div>
      ) : null}
      {row.rightKind === 'add' ? (
        <div className="diff-row-unified add">
          <span className="diff-line-number" />
          <span className="diff-line-number">{row.rightLineNumber ?? ''}</span>
          <span className="diff-line-marker">+</span>
          <code>{row.rightText || ' '}</code>
        </div>
      ) : null}
    </>
  );
}

function computeGap(previousHunk: DiffHunk | null, currentHunk: DiffHunk): number {
  if (!previousHunk) {
    return 0;
  }
  const previousEnd = previousHunk.oldStart + previousHunk.oldCount;
  const currentStart = currentHunk.oldStart;
  return Math.max(0, currentStart - previousEnd);
}
