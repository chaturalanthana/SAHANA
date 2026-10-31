export const color = {
  bg: '#f3f0e8',
  surface: '#fffcf7',
  text: '#1c2430',
  muted: '#5c6b7a',
  border: '#ddd6c8',
  primary: '#0f5e5b',
  primaryText: '#f7fffe',
  danger: '#9f2d2d',
  warning: '#8a5a00',
  success: '#1f7a4d',
  info: '#1d4e89',
  sidebar: '#123f3d',
  sidebarText: '#f4f1ea',
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

/** Families that cover Latin, Sinhala, and Tamil. SIL Open Font License. */
export const fontFamily =
  "'Noto Sans', 'Noto Sans Sinhala', 'Noto Sans Tamil', sans-serif";

export const fontSize = {
  body: 16,
  dense: 14,
  label: 12,
} as const;

export const lineHeight = {
  body: 1.6,
} as const;
