import { navigationItems } from '../lib/constants';
import type { ScreenId } from '../lib/types';
import { BrandLogo } from './BrandLogo';

interface SidebarNavProps {
  activeScreen: ScreenId;
  hints: Array<{
    id: ScreenId;
    label: string;
    shortLabel: string;
    icon: string;
    hint: string;
    badge: string | null;
    active: boolean;
  }>;
  onSelect: (screenId: ScreenId) => void;
}

export function SidebarNav({ activeScreen, hints, onSelect }: SidebarNavProps) {
  return (
    <aside className="shell-sidebar">
      <div className="shell-brand">
        <BrandLogo compact subtitle="Desktop runtime" />
      </div>

      <nav className="shell-nav" aria-label="Primary">
        {navigationItems.map((item) => {
          const meta = hints.find((entry) => entry.id === item.id);

          return (
            <button
              key={item.id}
              className={`nav-item ${activeScreen === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <small>{meta?.hint ?? item.shortLabel}</small>
              </span>
              {meta?.badge ? <span className="nav-badge">{meta.badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
