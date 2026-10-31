import { en } from './locales/en';
import { si } from './locales/si';
import { ta } from './locales/ta';

export const SUPPORTED_LOCALES = ['en', 'si', 'ta'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function flattenMessages(input: unknown, prefix = ''): Record<string, string> {
  if (typeof input === 'string') {
    return prefix ? { [prefix]: input } : {};
  }
  if (input === null || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const next = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flattenMessages(value, next));
  }
  return out;
}

const flat = {
  en: flattenMessages(en),
  si: flattenMessages(si),
  ta: flattenMessages(ta),
} as const;

export function translate(locale: Locale, key: string): string {
  const value = flat[locale][key as keyof (typeof flat)['en']];
  if (typeof value === 'string') return value;
  if (locale !== 'en') {
    const english = flat.en[key as keyof (typeof flat)['en']];
    if (typeof english === 'string') return english;
  }
  return key;
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'si' || value === 'ta';
}

export { en, si, ta };
