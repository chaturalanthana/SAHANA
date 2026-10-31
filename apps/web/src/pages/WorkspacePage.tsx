import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataTable, KpiCard, TextField, Toast } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

type Field = { name: string; labelKey: string };
type Section = {
  titleKey: string;
  hintKey: string;
  listPath: string;
  createPath?: string;
  permission?: string;
  fields: Field[];
};

const sections: Record<string, Section> = {
  members: {
    titleKey: 'modules.members.title',
    hintKey: 'modules.members.hint',
    listPath: '/api/v1/members',
    createPath: '/api/v1/members',
    permission: 'members.write',
    fields: [
      { name: 'memberNo', labelKey: 'modules.field.memberNo' },
      { name: 'givenName', labelKey: 'modules.field.givenName' },
      { name: 'familyName', labelKey: 'modules.field.familyName' },
      { name: 'statusCode', labelKey: 'modules.field.statusCode' },
      { name: 'categoryCode', labelKey: 'modules.field.categoryCode' },
    ],
  },
  governance: {
    titleKey: 'modules.governance.title',
    hintKey: 'modules.governance.hint',
    listPath: '/api/v1/committees',
    createPath: '/api/v1/committees',
    permission: 'governance.write',
    fields: [{ name: 'name', labelKey: 'modules.field.name' }],
  },
  welfare: {
    titleKey: 'modules.welfare.title',
    hintKey: 'modules.welfare.hint',
    listPath: '/api/v1/welfare-schemes',
    createPath: '/api/v1/welfare-schemes',
    permission: 'welfare.write',
    fields: [{ name: 'name', labelKey: 'modules.field.name' }],
  },
  ledger: {
    titleKey: 'modules.ledger.title',
    hintKey: 'modules.ledger.hint',
    listPath: '/api/v1/accounts',
    createPath: '/api/v1/accounts',
    permission: 'ledger.post',
    fields: [
      { name: 'code', labelKey: 'modules.field.accountCode' },
      { name: 'name', labelKey: 'modules.field.accountName' },
      { name: 'accountType', labelKey: 'modules.field.accountType' },
    ],
  },
  loans: {
    titleKey: 'modules.loans.title',
    hintKey: 'modules.loans.hint',
    listPath: '/api/v1/loan-products',
    createPath: '/api/v1/loan-products',
    permission: 'loans.write',
    fields: [{ name: 'name', labelKey: 'modules.field.name' }],
  },
  projects: {
    titleKey: 'modules.projects.title',
    hintKey: 'modules.projects.hint',
    listPath: '/api/v1/projects',
    createPath: '/api/v1/projects',
    permission: 'projects.write',
    fields: [
      { name: 'name', labelKey: 'modules.field.name' },
      { name: 'category', labelKey: 'modules.field.categoryCode' },
    ],
  },
  emergency: {
    titleKey: 'modules.emergency.title',
    hintKey: 'modules.emergency.hint',
    listPath: '/api/v1/emergency-requests',
    fields: [],
  },
  esg: {
    titleKey: 'modules.esg.title',
    hintKey: 'modules.esg.hint',
    listPath: '/api/v1/esg-goals',
    createPath: '/api/v1/esg-goals',
    permission: 'esg.write',
    fields: [{ name: 'name', labelKey: 'modules.field.name' }],
  },
};

function summary(item: Record<string, unknown>): string {
  const parts = [
    item.memberNo,
    item.givenName,
    item.familyName,
    item.name,
    item.code,
    item.requestType,
    item.eligibilityStatus,
    item.status,
  ].filter((part) => typeof part === 'string' && part.length > 0);
  return parts.join(' · ') || String(item.id ?? '');
}

export function WorkspacePage({ sectionKey }: { sectionKey: string }) {
  const section = sections[sectionKey];
  const { t } = useI18n();
  const session = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = section?.permission ? (session.me?.permissions.includes(section.permission) ?? false) : false;

  const list = useQuery({
    queryKey: [section?.listPath, page],
    enabled: Boolean(section),
    queryFn: () =>
      client.request<{ items: Record<string, unknown>[]; total?: number; pageSize?: number }>(
        `${section?.listPath ?? ''}?page=${page}&pageSize=25`,
      ),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!section?.createPath) throw new Error('missing');
      return client.request(section.createPath, { method: 'POST', body: JSON.stringify(draft) });
    },
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      setDraft({});
      setError(null);
      await queryClient.invalidateQueries({ queryKey: [section?.listPath] });
    },
    onError: () => setError(t('errors.generic')),
  });

  if (!section) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-heading">{t(section.titleKey)}</h1>
      <p className="mt-1 text-sm text-body">{t(section.hintKey)}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label={t('modules.kpi.records')} value={list.data ? String(list.data.total ?? list.data.items.length) : '—'} />
      </div>
      <p className="mt-3 rounded-md bg-warning/20 px-3 py-2 text-sm text-warning-ink">{t('modules.notice')}</p>
      {canWrite && section.createPath ? (
        <Card className="mt-4">
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            save.mutate();
          }}
        >
          {section.fields.map((field) => (
            <TextField
              key={field.name}
              name={field.name}
              label={t(field.labelKey)}
              value={draft[field.name] ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, [field.name]: event.target.value }))}
              required
            />
          ))}
          {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
          <div>
            <Button type="submit" loading={save.isPending}>
              {t('common.action.save')}
            </Button>
          </div>
        </form>
        </Card>
      ) : null}
      <Card className="mt-4">
        {list.data?.items.length === 0 ? <p className="text-sm text-body">{t('common.state.empty')}</p> : null}
        <DataTable
          columns={[{ key: 'summary', header: t(section.titleKey) }]}
          rows={(list.data?.items ?? []).map((item) => ({
            id: String(item.id),
            summary:
              sectionKey === 'members' ? (
                <Link className="text-primary-ink underline" to={`/members/${String(item.id)}`}>
                  {summary(item)}
                </Link>
              ) : (
                summary(item)
              ),
          }))}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            {t('common.action.previous')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={(list.data?.items.length ?? 0) < 25}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('common.action.next')}
          </Button>
        </div>
      </Card>
      <Toast message={message} />
    </div>
  );
}
