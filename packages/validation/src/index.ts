import { z } from 'zod';

export const LOCALES = ['en', 'si', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];

/** Keys returned by GET /api/v1/config. Nothing else may appear in that payload. */
export const PUBLIC_CONFIG_KEYS = [
  'displayName',
  'logoFileId',
  'contactEmail',
  'contactPhone',
  'defaultLanguage',
  'currencyCode',
  'timezone',
  'environmentLabel',
] as const;

export type PublicConfigKey = (typeof PUBLIC_CONFIG_KEYS)[number];

export const CRITICAL_CONFIG_KEYS = ['currencyCode', 'timezone'] as const;

export const LOGIN_RATE_LIMIT_KEY = 'auth.loginRateLimit';

/** Named default used only when the platform config row is missing. */
export const DEFAULT_LOGIN_RATE_LIMIT = 10;
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

const connectionStringPattern = /:\/\//;

export const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  societyId: z.string().uuid().optional(),
  client: z.enum(['web', 'mobile']),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(500),
});

export const switchSocietySchema = z.object({
  societyId: z.string().uuid(),
});

export const languageBodySchema = z.object({
  language: z.enum(LOCALES),
});

export const configWriteSchema = z.object({
  value: z.string().max(500),
  reason: z.string().trim().min(1).max(500),
});

export function parsePage(input: { page?: unknown; pageSize?: unknown }): {
  page: number;
  pageSize: number;
} {
  const raw = z
    .object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).optional(),
    })
    .parse(input);
  return {
    page: raw.page ?? 1,
    pageSize: Math.min(100, raw.pageSize ?? 25),
  };
}

export function validateConfigValue(
  key: string,
  value: string,
): { ok: true; value: string } | { ok: false; messageKey: 'errors.validation' } {
  const trimmed = value.trim();
  if (connectionStringPattern.test(trimmed)) {
    return { ok: false, messageKey: 'errors.validation' };
  }
  switch (key) {
    case 'displayName':
      if (trimmed.length < 1 || trimmed.length > 200) {
        return { ok: false, messageKey: 'errors.validation' };
      }
      return { ok: true, value: trimmed };
    case 'logoFileId':
      if (trimmed === '') return { ok: true, value: '' };
      if (!z.string().uuid().safeParse(trimmed).success) {
        return { ok: false, messageKey: 'errors.validation' };
      }
      return { ok: true, value: trimmed };
    case 'contactEmail':
      if (trimmed === '') return { ok: true, value: '' };
      if (!z.string().email().safeParse(trimmed).success) {
        return { ok: false, messageKey: 'errors.validation' };
      }
      return { ok: true, value: trimmed };
    case 'contactPhone':
      if (trimmed.length > 40) return { ok: false, messageKey: 'errors.validation' };
      return { ok: true, value: trimmed };
    case 'defaultLanguage':
      if (!LOCALES.includes(trimmed as Locale)) {
        return { ok: false, messageKey: 'errors.validation' };
      }
      return { ok: true, value: trimmed };
    case 'currencyCode':
      if (!/^[A-Z]{3}$/.test(trimmed)) {
        return { ok: false, messageKey: 'errors.validation' };
      }
      return { ok: true, value: trimmed };
    case 'timezone':
      if (!isTimeZone(trimmed)) return { ok: false, messageKey: 'errors.validation' };
      return { ok: true, value: trimmed };
    case 'environmentLabel':
      return { ok: false, messageKey: 'errors.validation' };
    default:
      return { ok: false, messageKey: 'errors.validation' };
  }
}

function isTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isCriticalConfigKey(key: string): boolean {
  return (CRITICAL_CONFIG_KEYS as readonly string[]).includes(key);
}

export function isPublicConfigKey(key: string): key is PublicConfigKey {
  return (PUBLIC_CONFIG_KEYS as readonly string[]).includes(key);
}
