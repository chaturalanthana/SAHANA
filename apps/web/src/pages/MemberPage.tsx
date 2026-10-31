import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, TextField, Toast } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

type Member = {
  id: string;
  memberNo: string;
  givenName: string;
  familyName: string;
  statusCode: string;
  categoryCode: string;
};

type Page<T> = { items: T[] };

type HistoryItem = { id: string; statusCode: string; reason: string };
type FamilyItem = { id: string; relationshipCode: string; givenName: string; familyName: string };
type RecordItem = { id: string; name?: string; status?: string; eligibilityStatus?: string; requestType?: string };

function LazyRecords({ title, path }: { title: string; path: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: [path],
    enabled: open,
    queryFn: () => client.request<Page<RecordItem>>(path),
  });
  return (
    <section className="rounded-md border border-border bg-surface p-3" aria-label={title}>
      <button type="button" className="min-h-11 text-sm font-medium" onClick={() => setOpen(true)} disabled={open}>
        {open ? title : `${title} — ${t('modules.member.open')}`}
      </button>
      {open && query.data ? (
        query.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-body">{t('common.state.empty')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {query.data.items.map((item) => (
              <li key={item.id} className="text-sm break-words">
                {[item.name, item.requestType, item.eligibilityStatus, item.status].filter(Boolean).join(' · ')}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

export function MemberPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const session = useSession();
  const queryClient = useQueryClient();
  const [statusDraft, setStatusDraft] = useState({ statusCode: '', reason: '' });
  const [familyDraft, setFamilyDraft] = useState({ givenName: '', familyName: '', relationshipCode: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const can = (code: string) => session.me?.permissions.includes(code) ?? false;
  const canWrite = can('members.write');

  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => client.request<Member>(`/api/v1/members/${id}`),
  });
  const history = useQuery({
    queryKey: ['member-history', id],
    queryFn: () => client.request<Page<HistoryItem>>(`/api/v1/members/${id}/history`),
  });
  const family = useQuery({
    queryKey: ['member-family', id],
    queryFn: () => client.request<Page<FamilyItem>>(`/api/v1/members/${id}/family`),
  });

  const saveStatus = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/members/${id}/status`, { method: 'POST', body: JSON.stringify(statusDraft) }),
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      setError(null);
      setStatusDraft({ statusCode: '', reason: '' });
      await queryClient.invalidateQueries({ queryKey: ['member', id] });
      await queryClient.invalidateQueries({ queryKey: ['member-history', id] });
    },
    onError: () => setError(t('errors.generic')),
  });
  const saveFamily = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/members/${id}/family`, { method: 'POST', body: JSON.stringify(familyDraft) }),
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      setError(null);
      setFamilyDraft({ givenName: '', familyName: '', relationshipCode: '' });
      await queryClient.invalidateQueries({ queryKey: ['member-family', id] });
    },
    onError: () => setError(t('errors.generic')),
  });

  if (member.isLoading) return <p className="text-sm text-body">{t('common.state.loading')}</p>;
  if (!member.data) return <p className="text-sm text-danger-ink">{t('errors.generic')}</p>;
  const profile = member.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link className="min-h-11 text-sm underline" to="/members">
        {t('modules.nav.members')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold break-words">
          {profile.givenName} {profile.familyName}
        </h1>
        <p className="text-sm break-words">{profile.memberNo}</p>
        <p className="text-sm break-words">{profile.statusCode}</p>
        <p className="text-sm break-words">{profile.categoryCode}</p>
      </header>
      <p className="rounded-md bg-warning/20 px-3 py-2 text-sm text-warning-ink">{t('modules.notice')}</p>

      <section className="flex flex-col gap-3" aria-label={t('modules.member.history')}>
        <h2 className="text-base font-semibold">{t('modules.member.history')}</h2>
        <ul className="flex flex-col gap-2">
          {history.data?.items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-surface p-3 text-sm break-words">
              {item.statusCode} · {item.reason}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            className="grid gap-3"
            aria-label={t('modules.member.history')}
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              saveStatus.mutate();
            }}
          >
            <TextField
              label={t('modules.member.newStatus')}
              value={statusDraft.statusCode}
              onChange={(event) => setStatusDraft((current) => ({ ...current, statusCode: event.target.value }))}
              required
            />
            <TextField
              label={t('modules.field.reason')}
              value={statusDraft.reason}
              onChange={(event) => setStatusDraft((current) => ({ ...current, reason: event.target.value }))}
              required
            />
            <div>
              <Button type="submit" loading={saveStatus.isPending}>
                {t('common.action.save')}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-label={t('modules.member.family')}>
        <h2 className="text-base font-semibold">{t('modules.member.family')}</h2>
        <ul className="flex flex-col gap-2">
          {family.data?.items.length === 0 ? <li className="text-sm text-body">{t('common.state.empty')}</li> : null}
          {family.data?.items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-surface p-3 text-sm break-words">
              {item.givenName} {item.familyName} · {item.relationshipCode}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            className="grid gap-3"
            aria-label={t('modules.member.family')}
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              saveFamily.mutate();
            }}
          >
            <TextField
              label={t('modules.field.givenName')}
              value={familyDraft.givenName}
              onChange={(event) => setFamilyDraft((current) => ({ ...current, givenName: event.target.value }))}
              required
            />
            <TextField
              label={t('modules.field.familyName')}
              value={familyDraft.familyName}
              onChange={(event) => setFamilyDraft((current) => ({ ...current, familyName: event.target.value }))}
              required
            />
            <TextField
              label={t('modules.field.relationshipCode')}
              value={familyDraft.relationshipCode}
              onChange={(event) => setFamilyDraft((current) => ({ ...current, relationshipCode: event.target.value }))}
              required
            />
            <div>
              <Button type="submit" loading={saveFamily.isPending}>
                {t('common.action.save')}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-md border border-border bg-surface p-3">
        <h2 className="text-base font-semibold">{t('modules.member.contributions')}</h2>
        <p className="mt-2 text-sm text-body">{t('modules.member.notCalculatedSection')}</p>
      </section>

      {can('welfare.read') ? <LazyRecords title={t('modules.member.welfare')} path={`/api/v1/members/${id}/claims`} /> : null}
      {can('loans.read') ? <LazyRecords title={t('modules.member.loans')} path={`/api/v1/members/${id}/loans`} /> : null}
      {can('projects.read') ? <LazyRecords title={t('modules.member.projects')} path={`/api/v1/members/${id}/projects`} /> : null}
      <section className="rounded-md border border-border bg-surface p-3">
        <h2 className="text-base font-semibold">{t('modules.member.documents')}</h2>
        <p className="mt-2 text-sm text-body">{t('common.state.empty')}</p>
      </section>
      <section className="rounded-md border border-border bg-surface p-3">
        <h2 className="text-base font-semibold">{t('modules.member.notifications')}</h2>
        <p className="mt-2 text-sm text-body">{t('common.state.empty')}</p>
      </section>
      {can('emergency.read') ? (
        <LazyRecords title={t('modules.nav.emergency')} path={`/api/v1/members/${id}/emergency-requests`} />
      ) : null}

      {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
      <Toast message={message} />
    </div>
  );
}
