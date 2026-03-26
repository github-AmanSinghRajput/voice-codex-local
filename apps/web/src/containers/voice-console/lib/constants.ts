import type { ScreenId } from './types';

export interface NavigationItem {
  id: ScreenId;
  label: string;
  shortLabel: string;
  icon: string;
}

export const navigationItems: NavigationItem[] = [
  { id: 'workspace', label: 'Workspace', shortLabel: 'Code', icon: '⌘' },
  { id: 'voice', label: 'Voice', shortLabel: 'Talk', icon: '◉' },
  { id: 'terminal', label: 'Text Chat', shortLabel: 'Chat', icon: '💬' },
  { id: 'shell', label: 'Shell', shortLabel: 'zsh', icon: '$' },
  { id: 'review', label: 'Review', shortLabel: 'Diff', icon: 'Δ' },
  { id: 'notes', label: 'Notes', shortLabel: 'Notes', icon: '📝' },
  { id: 'vibemusic', label: 'VibeMusic', shortLabel: 'Vibe', icon: '🎵' }
];
