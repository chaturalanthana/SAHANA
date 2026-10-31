import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ApiClientError } from '@sahana/api-client';
import { SUPPORTED_LOCALES } from '@sahana/i18n';
import { Button, TextField } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

const destinations = [
  ['/config', 'shell.nav.config', 'config.read'],
  ['/members', 'modules.nav.members', 'members.read'],
  ['/governance', 'modules.nav.governance', 'governance.read'],
  ['/welfare', 'modules.nav.welfare', 'welfare.read'],
  ['/approvals', 'modules.nav.approvals', 'approvals.read'],
  ['/ledger', 'modules.nav.ledger', 'ledger.read'],
  ['/loans', 'modules.nav.loans', 'loans.read'],
  ['/projects', 'modules.nav.projects', 'projects.read'],
  ['/emergency', 'modules.nav.emergency', 'emergency.read'],
  ['/esg', 'modules.nav.esg', 'esg.read'],
  ['/notifications', 'modules.nav.notifications', 'notifications.read'],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const session = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const societyName = session.config?.displayName || session.me?.society.name || '';
  const environment = session.config?.environmentLabel;

  function chooseLanguage(code: (typeof SUPPORTED_LOCALES)[number]) {
    setLocale(code);
    setLanguageOpen(false);
    if (session.me) {
      void client.request('/api/v1/me/language', {
        method: 'POST',
        body: JSON.stringify({ language: code }),
      });
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-40 focus:bg-surface focus:px-3 focus:py-2">
        {t('shell.nav.config')}
      </a>
      {environment ? (
        <p className="bg-warning/20 px-4 py-2 text-sm text-warning-ink">
          {t('shell.environment.banner')}: {environment}
        </p>
      ) : null}
      <div className="md:flex">
        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-heading/40 md:hidden"
            aria-label={t('common.action.close')}
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <aside
          className={`${mobileOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 w-64 bg-sidebar text-sidebar-text shadow-[var(--shadow-bar)] md:static md:block md:shrink-0 ${
            collapsed ? 'md:w-20' : 'md:w-64'
          }`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-5">
            <div className={collapsed ? 'md:sr-only' : ''}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-ink">{t('common.appName')}</p>
              <p className="mt-1 text-base font-semibold text-heading">{societyName}</p>
            </div>
          </div>
          <nav className="px-2 pb-6" aria-label={t('shell.nav.menu')}>
            {destinations
              .filter(([, , permission]) => session.me?.permissions.includes(permission) || (permission === 'emergency.read' && session.me?.permissions.includes('emergency.coordinate')))
              .map(([to, key]) => (
              <NavLink
                key={to}
                to={to}
                title={t(key)}
                className={({ isActive }) =>
                  `mb-1 flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${
                    isActive ? 'bg-primary/15 text-primary-ink' : 'text-sidebar-text hover:bg-bg'
                  }`
                }
                onClick={() => setMobileOpen(false)}
              >
                <span className={collapsed ? 'md:sr-only' : ''}>{t(key)}</span>
                {collapsed ? <span className="hidden md:inline" aria-hidden="true">{t(key).slice(0, 1)}</span> : null}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 m-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-bar)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-3 text-sm text-heading md:hidden"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((value) => !value)}
              >
                {t('shell.nav.menu')}
              </button>
              <button
                type="button"
                className="hidden min-h-11 rounded-md border border-border px-3 text-sm text-heading md:inline-flex md:items-center"
                aria-pressed={collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
              </button>
              <p className="hidden text-sm font-semibold text-heading md:block">{societyName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  className="min-h-11 rounded-md px-2 text-sm text-heading"
                  data-language-menu=""
                  aria-expanded={languageOpen}
                  aria-haspopup="listbox"
                  onClick={() => {
                    setLanguageOpen((value) => !value);
                    setAccountOpen(false);
                  }}
                >
                  {t('common.language.label')}: {t(`common.language.${locale}`)}
                </button>
                {languageOpen ? (
                  <ul
                    role="listbox"
                    aria-label={t('common.language.label')}
                    className="absolute right-0 z-20 mt-1 min-w-36 rounded-md bg-surface py-1 shadow-[var(--shadow-card)]"
                  >
                    {SUPPORTED_LOCALES.map((code) => (
                      <li key={code}>
                        <button
                          type="button"
                          data-locale={code}
                          aria-pressed={locale === code}
                          className={`min-h-11 w-full px-3 text-left text-sm ${locale === code ? 'text-primary-ink' : 'text-heading'}`}
                          onClick={() => chooseLanguage(code)}
                        >
                          {t(`common.language.${code}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="min-h-11 rounded-md px-2 text-sm font-medium text-heading"
                aria-expanded={accountOpen}
                aria-label={t('shell.user.menu')}
                onClick={() => {
                  setAccountOpen((value) => !value);
                  setLanguageOpen(false);
                }}
              >
                {session.me?.user.displayName}
              </button>
              <Button
                variant="quiet"
                type="button"
                onClick={() => {
                  void session.logout();
                }}
              >
                {t('common.action.signOut')}
              </Button>
            </div>
          </header>
          {accountOpen ? (
            <section className="sahana-card mx-3 mb-3 p-4">
              <h2 className="text-sm font-semibold text-heading">{t('shell.mfa.title')}</h2>
              <p className="mt-1 max-w-prose text-sm text-body">{t('shell.mfa.hint')}</p>
              {mfaMessage ? <p className="mt-2 text-sm text-heading">{mfaMessage}</p> : null}
              {otpauthUri ? (
                <p className="mt-2 break-all text-sm text-body">{otpauthUri}</p>
              ) : (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void client
                        .request<{ otpauthUri: string }>('/api/v1/me/mfa/enroll', { method: 'POST' })
                        .then((result) => {
                          setOtpauthUri(result.otpauthUri);
                          setMfaMessage(null);
                        })
                        .catch((caught: unknown) => {
                          if (caught instanceof ApiClientError) setMfaMessage(t(caught.body.messageKey ?? 'errors.generic'));
                        });
                    }}
                  >
                    {t('shell.mfa.start')}
                  </Button>
                </div>
              )}
              {otpauthUri ? (
                <form
                  className="mt-3 grid max-w-sm gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void client
                      .request('/api/v1/me/mfa/confirm', {
                        method: 'POST',
                        body: JSON.stringify({ code: mfaCode }),
                      })
                      .then(() => {
                        setMfaMessage(t('shell.mfa.saved'));
                        setOtpauthUri(null);
                        setMfaCode('');
                      })
                      .catch((caught: unknown) => {
                        if (caught instanceof ApiClientError) setMfaMessage(t(caught.body.messageKey ?? 'errors.generic'));
                      });
                  }}
                >
                  <TextField
                    label={t('shell.mfa.code')}
                    name="mfaCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    required
                  />
                  <div>
                    <Button type="submit">{t('shell.mfa.confirm')}</Button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}
          <main id="main" className="px-3 pb-6 md:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
