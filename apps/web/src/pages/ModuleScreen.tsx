import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataTable, TextField, Toast } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';

type Field = { name: string; labelKey: string };
export type ModuleConfig = {
  titleKey: string;
  hintKey: string;
  listPath: string;
  basePath: string;
  detailKind: string;
  createPath?: string;
  readPermission: string;
  writePermission?: string;
  fields: Field[];
  editPath?: string;
  editBodyKey?: string;
  detailAction?: 'decision' | 'emergency';
};

function labelOf(item: Record<string, unknown>): string {
  return [item.name, item.memberNo, item.title, item.code, item.requestType, item.status, item.body]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

export function ModuleScreen({ config }: { config: ModuleConfig }) {
  const { id } = useParams();
  return id ? <Detail config={config} id={id} /> : <List config={config} />;
}

function List({ config }: { config: ModuleConfig }) {
  const { t } = useI18n();
  const session = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const canRead = session.me?.permissions.includes(config.readPermission) ?? false;
  const canWrite = config.writePermission ? (session.me?.permissions.includes(config.writePermission) ?? false) : false;
  const list = useQuery({
    queryKey: [config.listPath, page],
    enabled: canRead,
    queryFn: () =>
      client.request<{ items: Record<string, unknown>[]; total?: number }>(`${config.listPath}?page=${page}&pageSize=25`),
  });
  const save = useMutation({
    mutationFn: () => client.request(config.createPath ?? '', { method: 'POST', body: JSON.stringify(draft) }),
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      setDraft({});
      await queryClient.invalidateQueries({ queryKey: [config.listPath] });
    },
  });
  if (!canRead) return <p className="text-sm text-body">{t('errors.forbidden')}</p>;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-heading">{t(config.titleKey)}</h1>
      <p className="text-sm text-body">{t(config.hintKey)}</p>
      {canWrite && config.createPath ? (
        <Card>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {config.fields.map((field) => (
              <TextField
                key={field.name}
                name={field.name}
                label={t(field.labelKey)}
                value={draft[field.name] ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, [field.name]: event.target.value }))}
                required
              />
            ))}
            <div>
              <Button type="submit" loading={save.isPending}>
                {t('common.action.save')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <Card>
        {list.data?.items.length === 0 ? <p className="text-sm text-body">{t('common.state.empty')}</p> : null}
        <DataTable
          columns={[{ key: 'summary', header: t(config.titleKey) }]}
          rows={(list.data?.items ?? []).map((item) => ({
            id: String(item.id),
            summary: (
              <Link className="text-primary-ink underline" to={`${config.basePath}/${String(item.id)}`}>
                {labelOf(item) || String(item.id)}
              </Link>
            ),
          }))}
        />
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t('common.action.previous')}
          </Button>
          <Button type="button" variant="secondary" disabled={(list.data?.items.length ?? 0) < 25} onClick={() => setPage((value) => value + 1)}>
            {t('common.action.next')}
          </Button>
        </div>
      </Card>
      <Toast message={message} />
    </div>
  );
}

function Detail({ config, id }: { config: ModuleConfig; id: string }) {
  const { t } = useI18n();
  const session = useSession();
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState('');
  const [action, setAction] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const canWrite = config.writePermission ? (session.me?.permissions.includes(config.writePermission) ?? false) : false;
  const canAct =
    config.detailAction === 'decision'
      ? (session.me?.permissions.includes('approvals.decide') ?? false)
      : config.detailAction === 'emergency'
        ? (session.me?.permissions.includes('emergency.coordinate') ?? false)
        : false;
  const record = useQuery({
    queryKey: ['record', config.detailKind, id],
    queryFn: () => client.request<Record<string, unknown>>(`/api/v1/records/${config.detailKind}/${id}`),
  });
  const saveEdit = useMutation({
    mutationFn: () =>
      client.request(`${config.editPath}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ [config.editBodyKey ?? 'name']: edit }),
      }),
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      await queryClient.invalidateQueries({ queryKey: ['record', config.detailKind, id] });
    },
  });
  const runAction = useMutation({
    mutationFn: () => {
      if (config.detailAction === 'decision') {
        return client.request(`/api/v1/approval-requests/${id}/decisions`, {
          method: 'POST',
          body: JSON.stringify({ stageNo: 1, decision: action.decision || 'approve', reason: action.reason }),
        });
      }
      return client.request(`/api/v1/emergency-requests/${id}/updates`, {
        method: 'POST',
        body: JSON.stringify({ note: action.reason, status: action.status || 'closed' }),
      });
    },
    onSuccess: async () => {
      setMessage(t('modules.saved'));
      await queryClient.invalidateQueries({ queryKey: ['record', config.detailKind, id] });
    },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link className="text-sm text-primary-ink underline" to={config.basePath}>
        {t(config.titleKey)}
      </Link>
      <h1 className="text-xl font-semibold text-heading">{t('modules.screen.detail')}</h1>
      <Card>
        {record.data
          ? Object.entries(record.data).map(([key, value]) => (
              <p key={key} className="break-words text-sm">
                <span className="font-semibold text-heading">{key}: </span>
                <span className="text-body">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
              </p>
            ))
          : <p className="text-sm text-body">{t('common.state.loading')}</p>}
      </Card>
      {canWrite && config.editPath ? (
        <Card>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveEdit.mutate();
            }}
          >
            <TextField label={t('modules.screen.edit')} name="edit" value={edit} onChange={(event) => setEdit(event.target.value)} required />
            <div>
              <Button type="submit" loading={saveEdit.isPending}>{t('common.action.save')}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {canAct ? (
        <Card>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              runAction.mutate();
            }}
          >
            <TextField
              label={t('modules.field.reason')}
              name="reason"
              value={action.reason ?? ''}
              onChange={(event) => setAction((current) => ({ ...current, reason: event.target.value }))}
              required
            />
            {config.detailAction === 'decision' ? (
              <TextField
                label={t('modules.nav.approvals')}
                name="decision"
                value={action.decision ?? 'approve'}
                onChange={(event) => setAction((current) => ({ ...current, decision: event.target.value }))}
              />
            ) : (
              <TextField
                label={t('modules.field.statusCode')}
                name="status"
                value={action.status ?? 'closed'}
                onChange={(event) => setAction((current) => ({ ...current, status: event.target.value }))}
              />
            )}
            <div>
              <Button type="submit" loading={runAction.isPending}>{t('common.action.save')}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      <Toast message={message} />
    </div>
  );
}

export function WelfareSchemesPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.welfare.title',
        hintKey: 'modules.welfare.hint',
        listPath: '/api/v1/welfare-schemes',
        basePath: '/welfare',
        detailKind: 'welfareScheme',
        createPath: '/api/v1/welfare-schemes',
        readPermission: 'welfare.read',
        writePermission: 'welfare.write',
        fields: [{ name: 'name', labelKey: 'modules.field.name' }],
      }}
    />
  );
}

export function ClaimsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.welfare.title',
        hintKey: 'modules.welfare.hint',
        listPath: '/api/v1/claims',
        basePath: '/welfare/claims',
        detailKind: 'claim',
        createPath: '/api/v1/claims',
        readPermission: 'welfare.read',
        writePermission: 'welfare.write',
        fields: [
          { name: 'memberId', labelKey: 'modules.field.memberNo' },
          { name: 'schemeVersionId', labelKey: 'modules.welfare.title' },
          { name: 'idempotencyKey', labelKey: 'modules.field.reason' },
        ],
      }}
    />
  );
}

export function ApprovalsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.nav.approvals',
        hintKey: 'modules.notice',
        listPath: '/api/v1/approval-requests',
        basePath: '/approvals',
        detailKind: 'approvalRequest',
        createPath: '/api/v1/approval-requests',
        readPermission: 'approvals.read',
        writePermission: 'welfare.write',
        detailAction: 'decision',
        fields: [
          { name: 'objectType', labelKey: 'modules.field.name' },
          { name: 'objectId', labelKey: 'modules.field.reason' },
        ],
      }}
    />
  );
}

export function LoansPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.loans.title',
        hintKey: 'modules.loans.hint',
        listPath: '/api/v1/loan-products',
        basePath: '/loans',
        detailKind: 'loanProduct',
        createPath: '/api/v1/loan-products',
        readPermission: 'loans.read',
        writePermission: 'loans.write',
        fields: [{ name: 'name', labelKey: 'modules.field.name' }],
      }}
    />
  );
}

export function GovernancePage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.governance.title',
        hintKey: 'modules.governance.hint',
        listPath: '/api/v1/committees',
        basePath: '/governance',
        detailKind: 'committee',
        createPath: '/api/v1/committees',
        readPermission: 'governance.read',
        writePermission: 'governance.write',
        editPath: '/api/v1/committees',
        fields: [{ name: 'name', labelKey: 'modules.field.name' }],
      }}
    />
  );
}

export function ProjectsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.projects.title',
        hintKey: 'modules.projects.hint',
        listPath: '/api/v1/projects',
        basePath: '/projects',
        detailKind: 'project',
        createPath: '/api/v1/projects',
        readPermission: 'projects.read',
        writePermission: 'projects.write',
        fields: [
          { name: 'name', labelKey: 'modules.field.name' },
          { name: 'category', labelKey: 'modules.field.categoryCode' },
        ],
      }}
    />
  );
}

export function SuggestionsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.projects.title',
        hintKey: 'modules.projects.hint',
        listPath: '/api/v1/suggestions',
        basePath: '/suggestions',
        detailKind: 'suggestion',
        createPath: '/api/v1/suggestions',
        readPermission: 'projects.read',
        writePermission: 'projects.write',
        fields: [
          { name: 'memberId', labelKey: 'modules.field.memberNo' },
          { name: 'body', labelKey: 'modules.field.description' },
        ],
      }}
    />
  );
}

export function EmergencyPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.emergency.title',
        hintKey: 'modules.emergency.hint',
        listPath: '/api/v1/emergency-requests',
        basePath: '/emergency',
        detailKind: 'emergencyRequest',
        createPath: '/api/v1/emergency-requests',
        readPermission: 'emergency.read',
        writePermission: 'emergency.write',
        detailAction: 'emergency',
        fields: [
          { name: 'memberId', labelKey: 'modules.field.memberNo' },
          { name: 'requestType', labelKey: 'modules.field.requestType' },
          { name: 'phone', labelKey: 'modules.field.phone' },
          { name: 'idempotencyKey', labelKey: 'modules.field.reason' },
        ],
      }}
    />
  );
}

export function EsgPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.esg.title',
        hintKey: 'modules.esg.hint',
        listPath: '/api/v1/esg-goals',
        basePath: '/esg',
        detailKind: 'esgGoal',
        createPath: '/api/v1/esg-goals',
        readPermission: 'esg.read',
        writePermission: 'esg.write',
        fields: [{ name: 'name', labelKey: 'modules.field.name' }],
      }}
    />
  );
}

export function NotificationsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: 'modules.nav.notifications',
        hintKey: 'modules.notice',
        listPath: '/api/v1/notification-templates',
        basePath: '/notifications',
        detailKind: 'notificationTemplate',
        createPath: '/api/v1/notification-templates',
        readPermission: 'notifications.read',
        writePermission: 'notifications.write',
        editPath: '/api/v1/notification-templates',
        editBodyKey: 'body',
        fields: [
          { name: 'code', labelKey: 'modules.field.name' },
          { name: 'language', labelKey: 'common.language.label' },
          { name: 'body', labelKey: 'modules.field.description' },
        ],
      }}
    />
  );
}
