import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { SUPPORTED_LOCALES } from '@sahana/i18n';
import { Button } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const societyName = session.config?.displayName || session.me?.society.name || '';
  const environment = session.config?.environmentLabel;

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-surface focus:px-3 focus:py-2">
        {t('shell.nav.config')}
      </a>
      {environment ? (
        <p className="bg-warning/15 px-4 py-2 text-sm text-warning">
          {t('shell.environment.banner')}: {environment}
        </p>
      ) : null}
      <div className="md:grid md:grid-cols-[220px_1fr]">
        <aside className={`${open ? 'block' : 'hidden'} bg-sidebar text-sidebar-text md:block`}>
          <div className="px-4 py-5">
            <p className="text-xs uppercase tracking-wide text-sidebar-text/70">{t('common.appName')}</p>
            <p className="mt-1 text-base font-semibold">{societyName}</p>
          </div>
          <nav className="px-2 pb-6">
            {(
              [
                ['/config', 'shell.nav.config'],
                ['/members', 'modules.nav.members'],
                ['/governance', 'modules.nav.governance'],
                ['/welfare', 'modules.nav.welfare'],
                ['/ledger', 'modules.nav.ledger'],
                ['/loans', 'modules.nav.loans'],
                ['/projects', 'modules.nav.projects'],
                ['/emergency', 'modules.nav.emergency'],
                ['/esg', 'modules.nav.esg'],
              ] as const
            ).map(([to, key]) => (
              <NavLink
                key={to}
                to={to}
                className="block min-h-11 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {t(key)}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-3 text-sm md:hidden"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {t('shell.nav.menu')}
            </button>
            <p className="hidden text-sm font-semibold md:block">{societyName}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={t('common.language.label')} className="flex flex-wrap gap-1">
                {SUPPORTED_LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    data-locale={code}
                    aria-pressed={locale === code}
                    className={`min-h-11 rounded-md px-2 text-sm ${locale === code ? 'bg-primary text-primary-text' : 'text-text'}`}
                    onClick={() => {
                      setLocale(code);
                      if (session.me) {
                        void client.request('/api/v1/me/language', {
                          method: 'POST',
                          body: JSON.stringify({ language: code }),
                        });
                      }
                    }}
                  >
                    {t(`common.language.${code}`)}
                  </button>
                ))}
              </div>
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
          <main id="main" className="p-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
