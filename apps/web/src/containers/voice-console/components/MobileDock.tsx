import { navigationItems } from '../lib/constants';
import type { ScreenId } from '../lib/types';

interface MobileDockProps {
  activeScreen: ScreenId;
  onSelect: (screenId: ScreenId) => void;
}

export function MobileDock({ activeScreen, onSelect }: MobileDockProps) {
  return (
    <nav className="mobile-dock" aria-label="Mobile navigation">
      {navigationItems.map((item) => (
        <button
          key={item.id}
          className={`mobile-dock-item ${activeScreen === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <span>{item.icon}</span>
          <small>{item.shortLabel}</small>
        </button>
      ))}
    </nav>
  );
}
