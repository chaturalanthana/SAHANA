export type Locale = 'en' | 'si' | 'ta';

export type ApiErrorBody = {
  code: string;
  messageKey: string;
  fields?: { path: string; messageKey: string }[];
  traceId: string;
};

export type Page<T> = {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  preferredLanguage: Locale | null;
};

export type SessionSociety = {
  id: string;
  name: string;
};

export type LoginResponse = {
  user: SessionUser;
  society: SessionSociety;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type PublicConfig = {
  displayName: string;
  logoFileId: string;
  contactEmail: string;
  contactPhone: string;
  defaultLanguage: string;
  currencyCode: string;
  timezone: string;
  environmentLabel: string;
};

export type ConfigChange = {
  id: string;
  key: string;
  value: string;
  reason: string;
  createdBy: string;
  createdByDisplayName: string;
  createdAt: string;
};

export type DirectoryUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
};
