export const THEMES = ['clean', 'pos', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const THEME_KEY = 'cos_theme';

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  return stored && THEMES.includes(stored) ? stored : 'clean';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function storeTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}