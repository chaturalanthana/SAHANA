import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfigChange, PublicConfig } from '@sahana/types';
import { CRITICAL_CONFIG_KEYS, PUBLIC_CONFIG_KEYS } from '@sahana/validation';
import { Button, StatusPill, TextField, Toast } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

const editableKeys = PUBLIC_CONFIG_KEYS.filter((key) => key !== 'environmentLabel');

export function ConfigPage() {
  const { t } = useI18n();
  const session = useSession();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<PublicConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (session.config && draft === null) {
    setDraft(session.config);
  }

  const changes = useQuery({
    queryKey: ['config-changes'],
    queryFn: () => client.request<{ items: ConfigChange[] }>('/api/v1/config/changes'),
  });
  const consent = useQuery({
    queryKey: ['consent'],
    queryFn: () => client.request<{ documents: { id: string; title: string }[] }>('/api/v1/consent'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const canWrite = session.me?.permissions.includes('config.write');
      if (!canWrite || !draft) throw new Error('forbidden');
      for (const key of editableKeys) {
        const next = draft[key] ?? '';
        const current = session.config?.[key] ?? '';
        if (next === current) continue;
        await client.request(`/api/v1/config/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ value: next, reason }),
        });
      }
    },
    onSuccess: async () => {
      setMessage(t('config.save.success'));
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      await queryClient.invalidateQueries({ queryKey: ['config-changes'] });
    },
    onError: () => setError(t('config.error.forbidden')),
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      client.request(`/api/v1/config/changes/${id}/approve`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      await queryClient.invalidateQueries({ queryKey: ['config-changes'] });
    },
  });

  if (!session.config) {
    return <p className="text-sm text-muted">{t('common.state.loading')}</p>;
  }

  const canWrite = session.me?.permissions.includes('config.write') ?? false;
  const canApprove = session.me?.permissions.includes('config.approve') ?? false;

  if (!session.config || !draft) {
    return <p className="text-sm text-muted">{t('common.state.loading')}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t('config.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('config.description')}</p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          save.mutate();
        }}
      >
        {editableKeys.map((key) => (
          <TextField
            key={key}
            name={key}
            label={t(`config.field.${key}`)}
            value={draft[key]}
            disabled={!canWrite}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, [key]: event.target.value } : current))
            }
            hint={
              (CRITICAL_CONFIG_KEYS as readonly string[]).includes(key)
                ? t('config.critical.pending')
                : undefined
            }
          />
        ))}
        <TextField
          name="environmentLabel"
          label={t('config.field.environmentLabel')}
          value={session.config?.environmentLabel ?? ''}
          readOnly
        />
        {canWrite ? (
          <TextField
            name="reason"
            label={t('config.reason.label')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {canWrite ? (
          <div>
            <Button type="submit" loading={save.isPending}>
              {t('common.action.save')}
            </Button>
          </div>
        ) : null}
      </form>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t('config.critical.pending')}</h2>
        {changes.data && changes.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('common.state.empty')}</p>
        ) : null}
        <ul className="mt-2 flex flex-col gap-2">
          {changes.data?.items.map((item) => {
            const mine = item.createdBy === session.me?.user.id;
            return (
              <li key={item.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={t(`config.field.${item.key}`)} tone="warning" />
                  <span>{item.value}</span>
                </div>
                <p className="mt-1 text-muted">{item.reason}</p>
                {mine ? <p className="mt-2">{t('config.critical.selfApproval')}</p> : null}
                {canApprove && !mine ? (
                  <Button type="button" className="mt-2" onClick={() => approve.mutate(item.id)}>
                    {t('config.critical.approve')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t('config.consent.title')}</h2>
        {consent.data && consent.data.documents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('config.consent.empty')}</p>
        ) : (
          <ul className="mt-2 text-sm">
            {consent.data?.documents.map((document) => (
              <li key={document.id}>{document.title}</li>
            ))}
          </ul>
        )}
      </section>
      <Toast message={message} />
    </div>
  );
}
