// ─────────────────────────────────────────────────────────────
// client/src/components/layout/ThemeToggle.jsx
//
// One button, two states. Not the three-way light/dark/system menu
// shadcn's docs show: "system" is already the default for anyone who
// has never touched this (lib/theme.js seeds from the OS), so the menu
// would spend a click and a popover explaining a state the app is
// usually in anyway. The same argument the "Less movement" button in
// this bar makes — it is an aria-pressed toggle, not a menu.
//
// The icon shows where the button GOES, not where you are: a moon on
// the light theme. That is the convention every OS uses and the one
// people guess right.
// ─────────────────────────────────────────────────────────────
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleTheme}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
