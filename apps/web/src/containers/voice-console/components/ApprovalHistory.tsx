import { formatTimestamp } from '../lib/helpers';
import type { ApprovalHistoryEntry } from '../lib/types';

interface ApprovalHistoryProps {
  approvalHistory: ApprovalHistoryEntry[];
}

export function ApprovalHistory({ approvalHistory }: ApprovalHistoryProps) {
  return (
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
  );
}
