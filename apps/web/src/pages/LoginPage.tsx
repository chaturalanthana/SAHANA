import { useState } from 'react';
import { ApiClientError } from '@sahana/api-client';
import type { SessionSociety } from '@sahana/types';
import { Button, TextField } from '@sahana/ui-web';
import { SUPPORTED_LOCALES } from '@sahana/i18n';
import { useI18n } from '../i18n';
import { useSession } from '../session';

export function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [societyId, setSocietyId] = useState('');
  const [choices, setChoices] = useState<SessionSociety[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await session.login({
        email,
        password,
        ...(societyId ? { societyId } : {}),
      });
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) {
        const body = caught.body as { choices?: SessionSociety[] };
        setChoices(body.choices ?? []);
      } else if (caught instanceof ApiClientError && caught.status === 429) {
        setError(t('auth.signIn.rateLimited'));
      } else if (caught instanceof ApiClientError) {
        setError(t(caught.body.messageKey ?? 'auth.signIn.failed'));
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold tracking-wide text-primary-ink">{t('common.appName')}</p>
        <div role="group" aria-label={t('common.language.label')} className="flex gap-1">
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              data-locale={code}
              aria-pressed={locale === code}
              className={`min-h-11 rounded-md px-2 text-sm ${locale === code ? 'bg-primary/15 font-semibold text-primary-ink' : 'text-heading'}`}
              onClick={() => setLocale(code)}
            >
              {t(`common.language.${code}`)}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={(event) => void submit(event)} className="sahana-card p-4">
        <h1 className="text-xl font-semibold text-heading">{t('auth.signIn.title')}</h1>
        <div className="mt-4 flex flex-col gap-3">
          <TextField
            label={t('auth.signIn.email')}
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField
            label={t('auth.signIn.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {choices.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t('auth.signIn.chooseSociety')}</span>
              <select
                className="min-h-11 rounded-md border border-border bg-surface px-3"
                value={societyId}
                onChange={(event) => setSocietyId(event.target.value)}
                required
              >
                <option value="">{t('auth.signIn.society')}</option>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={pending}>
            {t('auth.signIn.submit')}
          </Button>
        </div>
      </form>
    </main>
  );
}
