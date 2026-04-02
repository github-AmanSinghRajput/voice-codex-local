import { forwardRef } from 'react';
import { DiffView } from './DiffView';
import { FileExplanation } from './FileExplanation';
import type { DiffFileBlock, PendingApproval } from '../lib/types';

interface ReviewFileCardProps {
  file: DiffFileBlock;
  fileIndex: number;
  pendingApproval: PendingApproval | null;
  diffMode: 'split' | 'unified';
  isCollapsed: boolean;
  isViewed: boolean;
  onToggleCollapse: (filePath: string) => void;
  onToggleViewed: (filePath: string) => void;
  stats: { additions: number; deletions: number };
}

function toAnchorId(filePath: string) {
  return `review-file-${filePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`;
}

export const ReviewFileCard = forwardRef<HTMLElement, ReviewFileCardProps>(function ReviewFileCard(
  {
    file,
    fileIndex,
    pendingApproval,
    diffMode,
    isCollapsed,
    isViewed,
    onToggleCollapse,
    onToggleViewed,
    stats
  },
  ref
) {
  const tasks = pendingApproval?.tasks ?? [];

  return (
    <article
      className={`content-card review-file-card${isCollapsed ? ' review-file-card-collapsed' : ''}`}
      id={toAnchorId(file.filePath)}
      ref={ref}
    >
      <div className="review-file-card-head">
        <button
          className="review-file-collapse-toggle"
          onClick={() => onToggleCollapse(file.filePath)}
          type="button"
          aria-label={isCollapsed ? 'Expand file' : 'Collapse file'}
        >
          <span className={`file-tree-chevron${isCollapsed ? '' : ' expanded'}`}>&#x25B6;</span>
        </button>
        <div className="review-file-card-title">
          <span className="metric-label">File {fileIndex + 1}</span>
          <strong>{file.filePath}</strong>
        </div>
        <div className="review-file-card-controls">
          <span className="section-chip-group review-file-stats">
            {stats.additions > 0 ? <span className="section-chip approved">+{stats.additions}</span> : null}
            {stats.deletions > 0 ? <span className="section-chip rejected">-{stats.deletions}</span> : null}
          </span>
          <label className="review-viewed-checkbox">
            <input
              type="checkbox"
              checked={isViewed}
              onChange={() => onToggleViewed(file.filePath)}
            />
            <span>Viewed</span>
          </label>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          <FileExplanation filePath={file.filePath} tasks={tasks} diff={file.diff} />
          <div className="review-diff-frame">
            <DiffView filePath={file.filePath} diff={file.diff} mode={diffMode} />
          </div>
        </>
      ) : null}
    </article>
  );
});
