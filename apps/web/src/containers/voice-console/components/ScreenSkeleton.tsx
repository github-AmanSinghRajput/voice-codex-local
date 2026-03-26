import type { ScreenId } from '../lib/types';

interface ScreenSkeletonProps {
  screenId: ScreenId;
}

export function ScreenSkeleton({ screenId }: ScreenSkeletonProps) {
  return (
    <section className="screen skeleton-screen" aria-label="Loading screen">
      <div className="section-head">
        <div>
          <div className="skeleton-block skeleton-kicker" />
          <div className="skeleton-block skeleton-title" />
        </div>
        <div className="skeleton-block skeleton-chip" />
      </div>

      <div className={`skeleton-layout ${screenId}`}>
        <div className="skeleton-card">
          <div className="skeleton-block skeleton-heading" />
          <div className="skeleton-block skeleton-line" />
          <div className="skeleton-block skeleton-line" />
          <div className="skeleton-block skeleton-line short" />
          <div className="skeleton-actions">
            <div className="skeleton-block skeleton-button" />
            <div className="skeleton-block skeleton-button muted" />
          </div>
        </div>

        <div className="skeleton-stack">
          <div className="skeleton-card compact">
            <div className="skeleton-block skeleton-heading short" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line short" />
          </div>
          <div className="skeleton-card compact">
            <div className="skeleton-block skeleton-heading short" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line short" />
          </div>
        </div>
      </div>
    </section>
  );
}
