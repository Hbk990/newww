import { useEffect, useState } from 'react';

/**
 * WHICH LOOK IS ON.
 *
 * Light for the day's work, dark for the evening and for standing beside a
 * customer. The choice is written on the <html> element, which every colour in
 * the stylesheet reads from, and remembered in this browser — it is a personal
 * preference, not business data, so it never goes near the database.
 */
export type Theme = 'light' | 'dark';

const KEY = 'showroom-theme';

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // A browser with storage switched off still gets a working app.
  }
  return 'light';
}

/** Applied before React renders, so the page never flashes the wrong colour. */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = stored();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not being able to remember it is not a reason to fail.
    }
  }, [theme]);

  return { theme, setTheme };
}
