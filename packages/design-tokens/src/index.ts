/**
 * Palette taken from the public iBilz admin theme (app.ibilz.com, 31 October 2026).
 * Web CSS variables in apps/web/src/styles.css must use these same values.
 * Brand fills stay as published. *Ink values are darker so text on white meets WCAG 2.2 AA.
 */
export const color = {
  brandPrimary: '#6ca925',
  secondary: '#82868b',
  success: '#28c76f',
  danger: '#ea5455',
  warning: '#ff9f43',
  info: '#00cfe8',
  heading: '#4b4b4b',
  headingDark: '#22292f',
  body: '#6e6b7b',
  muted: '#b9b9c3',
  bg: '#f6f6f6',
  surface: '#ffffff',
  border: '#ebe9f1',
  /** Darkened brand green. #6ca925 on white is about 2.9:1. */
  primaryInk: '#3d6810',
  successInk: '#0e7a3a',
  dangerInk: '#9f1d24',
  warningInk: '#8a4b00',
  infoInk: '#0a6e7a',
  primary: '#6ca925',
  /** Dark label on the brand-green button. White on #6ca925 fails AA. */
  primaryText: '#22292f',
  text: '#4b4b4b',
  sidebar: '#ffffff',
  sidebarText: '#625f6e',
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

export const shadow = {
  card: '0 4px 24px 0 rgba(34, 41, 47, 0.1)',
  bar: '0 4px 24px 0 rgba(34, 41, 47, 0.08)',
} as const;

export const radius = {
  card: 8,
  control: 6,
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
