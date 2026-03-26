import { useEffect, useState } from 'react';
import { parseDiffRows } from '../lib/diff';
import { formatTimestamp, summarizeApproval } from '../lib/helpers';
import type { ApprovalHistoryEntry, DiffSummary, PendingApproval } from '../lib/types';

interface ReviewScreenProps {
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  approvalHistory: ApprovalHistoryEntry[];
  onApprove: () => void;
  onReject: () => void;
}

function countDiffStats(diff: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

function shortenPath(filePath: string) {
  const parts = filePath.split('/');
  if (parts.length <= 2) {
    return filePath;
  }
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

export function ReviewScreen({
  pendingApproval,
  lastDiff,
  approvalHistory,
  onApprove,
  onReject
}: ReviewScreenProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(lastDiff?.files[0]?.filePath ?? null);

  useEffect(() => {
    setSelectedFilePath((current) => {
      if (!lastDiff?.files.length) {
        return null;
      }

      if (current && lastDiff.files.some((file) => file.filePath === current)) {
        return current;
      }

      return lastDiff.files[0].filePath;
    });
  }, [lastDiff]);

  const selectedDiffFile =
    lastDiff?.files.find((file) => file.filePath === selectedFilePath) ?? lastDiff?.files[0] ?? null;
  const diffRows = selectedDiffFile ? parseDiffRows(selectedDiffFile.diff) : [];
  const totalStats = lastDiff?.files.reduce(
    (acc, file) => {
      const stats = countDiffStats(file.diff);
      return { additions: acc.additions + stats.additions, deletions: acc.deletions + stats.deletions };
    },
    { additions: 0, deletions: 0 }
  ) ?? { additions: 0, deletions: 0 };

  return (
    <section className="screen review-screen">
      <div className="section-head">
        <div>
          <p className="section-kicker">Code Review</p>
          <h2>Review proposed changes before they touch your workspace.</h2>
        </div>
        <div className="section-chip-group">
          <span className="section-chip">{summarizeApproval(pendingApproval)}</span>
          {lastDiff?.changedFiles.length ? (
            <>
              <span className="section-chip">{lastDiff.changedFiles.length} files</span>
              {totalStats.additions > 0 ? <span className="section-chip approved">+{totalStats.additions}</span> : null}
              {totalStats.deletions > 0 ? <span className="section-chip rejected">-{totalStats.deletions}</span> : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="review-layout">
        <section className="content-card">
          <div className="card-head">
            <div>
              <span className="metric-label">Pending request</span>
              <strong>{pendingApproval?.title ?? 'No pending write request'}</strong>
            </div>
            {pendingApproval ? <span className="section-chip pending">approval waiting</span> : null}
          </div>

          {pendingApproval ? (
            <div className="approval-stack">
              <p className="approval-summary">{pendingApproval.summary}</p>
              <ul className="task-list">
                {pendingApproval.tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
              <div className="action-row">
                <button className="button-primary" onClick={onApprove} type="button">
                  Approve changes
                </button>
                <button className="button-secondary danger" onClick={onReject} type="button">
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state compact">
              <p>No approval is waiting right now.</p>
              <span>Once Codex proposes a write task, it will show up here for explicit review.</span>
            </div>
          )}
        </section>

        <section className="diff-panel">
          <div className="diff-header">
            <div>
              <span className="metric-label">Changed files</span>
              <strong>{selectedDiffFile?.filePath ?? 'No diff captured yet'}</strong>
            </div>
          </div>

          {selectedDiffFile && lastDiff ? (
            <>
              <div className="diff-file-tabs" role="tablist" aria-label="Changed files">
                {lastDiff.files.map((file) => {
                  const stats = countDiffStats(file.diff);
                  const isActive = selectedDiffFile.filePath === file.filePath;

                  return (
                    <button
                      key={file.filePath}
                      className={`diff-file-tab ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedFilePath(file.filePath)}
                      type="button"
                    >
                      <span className="diff-file-tab-name">{shortenPath(file.filePath)}</span>
                      <span className="diff-file-tab-stats">
                        {stats.additions > 0 ? <span className="diff-stat-add">+{stats.additions}</span> : null}
                        {stats.deletions > 0 ? <span className="diff-stat-del">-{stats.deletions}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="diff-split-view">
                <div className="diff-pane">
                  <div className="diff-pane-header">
                    <span>Current</span>
                    <span className="diff-pane-path">{shortenPath(selectedDiffFile.filePath)}</span>
                  </div>
                  <div className="diff-rows">
                    {diffRows.map((row, index) => (
                      <div key={`left-${index}`} className={`diff-row ${row.leftKind}`}>
                        <span className="diff-line-number">{row.leftLineNumber ?? ''}</span>
                        <span className="diff-line-marker">
                          {row.leftKind === 'remove' ? '-' : row.leftKind === 'context' ? ' ' : ''}
                        </span>
                        <code>{row.leftText || ' '}</code>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="diff-pane">
                  <div className="diff-pane-header">
                    <span>Proposed</span>
                    <span className="diff-pane-path">{shortenPath(selectedDiffFile.filePath)}</span>
                  </div>
                  <div className="diff-rows">
                    {diffRows.map((row, index) => (
                      <div key={`right-${index}`} className={`diff-row ${row.rightKind}`}>
                        <span className="diff-line-number">{row.rightLineNumber ?? ''}</span>
                        <span className="diff-line-marker">
                          {row.rightKind === 'add' ? '+' : row.rightKind === 'context' ? ' ' : ''}
                        </span>
                        <code>{row.rightText || ' '}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state compact">
              <p>No diff available yet.</p>
              <span>Once approved edits run, the latest captured diff will appear here.</span>
            </div>
          )}
        </section>
      </div>

      <section className="content-card">
        <div className="card-head">
          <div>
            <span className="metric-label">Approval history</span>
            <strong>Recent write decisions</strong>
          </div>
        </div>
        <div className="history-list">
          {approvalHistory.length === 0 ? (
            <div className="empty-state compact">
              <p>No recorded approval history yet.</p>
              <span>Approved and rejected write requests will accumulate here.</span>
            </div>
          ) : (
            approvalHistory.map((entry) => (
              <article key={entry.id} className="history-item">
                <div>
                  <strong>{entry.taskTitle}</strong>
                  <p>{entry.taskSummary}</p>
                </div>
                <div className="history-meta">
                  <span className={`section-chip ${entry.approved ? 'approved' : 'rejected'}`}>
                    {entry.approved ? 'approved' : 'rejected'}
                  </span>
                  <small>{formatTimestamp(entry.reviewedAt)}</small>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
