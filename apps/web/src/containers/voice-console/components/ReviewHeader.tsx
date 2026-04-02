import type { PendingApproval } from '../lib/types';

interface ReviewHeaderProps {
  assistantLabel: string;
  pendingApproval: PendingApproval | null;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  viewedCount: number;
  diffMode: 'split' | 'unified';
  onToggleDiffMode: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleFileTree?: () => void;
}

export function ReviewHeader({
  assistantLabel,
  pendingApproval,
  totalFiles,
  totalAdditions,
  totalDeletions,
  viewedCount,
  diffMode,
  onToggleDiffMode,
  onApprove,
  onReject,
  onToggleFileTree
}: ReviewHeaderProps) {
  const waitingSince = pendingApproval?.createdAt
    ? formatRelativeTime(pendingApproval.createdAt)
    : null;

  return (
    <header className="review-header-sticky">
      <div className="review-header-top">
        <div className="review-header-title">
          {onToggleFileTree ? (
            <button className="review-file-drawer-toggle" onClick={onToggleFileTree} type="button">
              &#x2630;
            </button>
          ) : null}
          <div>
            <p className="section-kicker">AI Review</p>
            <h2>{pendingApproval?.title ?? 'Review proposed changes'}</h2>
          </div>
        </div>
        <div className="review-header-actions">
          {pendingApproval ? (
            <>
              <button className="button-primary" onClick={onApprove} type="button">
                Approve changes
              </button>
              <button className="button-secondary danger" onClick={onReject} type="button">
                Reject
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="review-header-meta">
        <div className="section-chip-group">
          {totalFiles > 0 ? <span className="section-chip">{totalFiles} files changed</span> : null}
          {totalAdditions > 0 ? <span className="section-chip approved">+{totalAdditions}</span> : null}
          {totalDeletions > 0 ? <span className="section-chip rejected">-{totalDeletions}</span> : null}
          {totalFiles > 0 ? (
            <span className="section-chip">{viewedCount} / {totalFiles} reviewed</span>
          ) : null}
          {waitingSince ? (
            <span className="review-status-pill">Waiting for approval &middot; {waitingSince}</span>
          ) : null}
        </div>
        <button
          className="diff-mode-toggle"
          onClick={onToggleDiffMode}
          type="button"
          title={`Switch to ${diffMode === 'split' ? 'unified' : 'split'} view`}
        >
          {diffMode === 'split' ? 'Unified' : 'Split'}
        </button>
      </div>

      {pendingApproval?.summary ? (
        <p className="review-header-summary">{pendingApproval.summary}</p>
      ) : !pendingApproval ? (
        <p className="review-header-summary">
          {assistantLabel} will wait for your decision before applying any file changes.
        </p>
      ) : null}
    </header>
  );
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
