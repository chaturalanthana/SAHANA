import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@sahana/api-client";
import { Button, Card, DataTable, TextField, Toast } from "@sahana/ui-web";
import { useI18n } from "../i18n";
import { client, useSession } from "../session";

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
  detailAction?: "decision" | "emergency";
  links?: { to: string; labelKey: string }[];
};

function labelOf(item: Record<string, unknown>): string {
  return [
    item.name,
    item.memberNo,
    item.title,
    item.code,
    item.requestType,
    item.description,
    item.status,
    item.body,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" · ");
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
  const canRead =
    session.me?.permissions.includes(config.readPermission) ?? false;
  const canWrite = config.writePermission
    ? (session.me?.permissions.includes(config.writePermission) ?? false)
    : false;
  const list = useQuery({
    queryKey: [config.listPath, page],
    enabled: canRead,
    queryFn: () =>
      client.request<{ items: Record<string, unknown>[]; total?: number }>(
        `${config.listPath}?page=${page}&pageSize=25`,
      ),
  });
  const save = useMutation({
    mutationFn: () =>
      client.request(config.createPath ?? "", {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      setDraft({});
      await queryClient.invalidateQueries({ queryKey: [config.listPath] });
    },
  });
  if (!canRead)
    return <p className="text-sm text-body">{t("errors.forbidden")}</p>;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-heading">
        {t(config.titleKey)}
      </h1>
      {config.links?.map((link) => (
        <Link
          key={link.to}
          className="text-sm text-primary-ink underline"
          to={link.to}
        >
          {t(link.labelKey)}
        </Link>
      ))}
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
                value={draft[field.name] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                required
              />
            ))}
            <div>
              <Button type="submit" loading={save.isPending}>
                {t("common.action.save")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <Card>
        {list.data?.items.length === 0 ? (
          <p className="text-sm text-body">{t("common.state.empty")}</p>
        ) : null}
        <DataTable
          columns={[{ key: "summary", header: t(config.titleKey) }]}
          rows={(list.data?.items ?? []).map((item) => ({
            id: String(item.id),
            summary: (
              <Link
                className="text-primary-ink underline"
                to={`${config.basePath}/${String(item.id)}`}
              >
                {labelOf(item) || String(item.id)}
              </Link>
            ),
          }))}
        />
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t("common.action.previous")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={(list.data?.items.length ?? 0) < 25}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("common.action.next")}
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
  const [edit, setEdit] = useState("");
  const [action, setAction] = useState<Record<string, string>>({});
  const [pay, setPay] = useState({
    periodId: "",
    expenseAccountId: "",
    cashAccountId: "",
    amount: "",
    reason: "",
  });
  const [schedule, setSchedule] = useState({ principal: "", startOn: "" });
  const [journalLineId, setJournalLineId] = useState("");
  const [scheduleLines, setScheduleLines] = useState<
    { installmentNo: number; dueOn: string; principal: string }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const canWrite = config.writePermission
    ? (session.me?.permissions.includes(config.writePermission) ?? false)
    : false;
  const canPay =
    config.detailKind === "claim" &&
    (session.me?.permissions.includes("ledger.post") ?? false);
  const canSchedule =
    config.detailKind === "loanApplication" &&
    (session.me?.permissions.includes("loans.write") ?? false);
  const canMatch =
    config.detailKind === "bankStatementLine" &&
    (session.me?.permissions.includes("ledger.post") ?? false);
  const canAct =
    config.detailAction === "decision"
      ? (session.me?.permissions.includes("approvals.decide") ?? false)
      : config.detailAction === "emergency"
        ? (session.me?.permissions.includes("emergency.coordinate") ?? false)
        : false;
  const record = useQuery({
    queryKey: ["record", config.detailKind, id],
    queryFn: () =>
      client.request<Record<string, unknown>>(
        `/api/v1/records/${config.detailKind}/${id}`,
      ),
  });
  const saveEdit = useMutation({
    mutationFn: () =>
      client.request(`${config.editPath}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ [config.editBodyKey ?? "name"]: edit }),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["record", config.detailKind, id],
      });
    },
  });
  function fail(error: unknown) {
    setMessage(
      error instanceof ApiClientError
        ? t(error.body.messageKey ?? "errors.generic")
        : t("common.state.error"),
    );
  }
  const payClaim = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/claims/${id}/pay`, {
        method: "POST",
        body: JSON.stringify(pay),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["record", config.detailKind, id],
      });
    },
    onError: fail,
  });
  const generateSchedule = useMutation({
    mutationFn: () =>
      client.request<{
        items: { installmentNo: number; dueOn: string; principal: string }[];
      }>(`/api/v1/loan-applications/${id}/schedule`, {
        method: "POST",
        body: JSON.stringify(schedule),
      }),
    onSuccess: async (result) => {
      setScheduleLines(result.items);
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["record", config.detailKind, id],
      });
    },
    onError: fail,
  });
  const matchLine = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/bank-statement-lines/${id}/match`, {
        method: "POST",
        body: JSON.stringify({ journalLineId }),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["record", config.detailKind, id],
      });
    },
    onError: fail,
  });
  const runAction = useMutation({
    mutationFn: () => {
      if (config.detailAction === "decision") {
        return client.request(`/api/v1/approval-requests/${id}/decisions`, {
          method: "POST",
          body: JSON.stringify({
            stageNo: 1,
            decision: action.decision || "approve",
            reason: action.reason,
          }),
        });
      }
      return client.request(`/api/v1/emergency-requests/${id}/updates`, {
        method: "POST",
        body: JSON.stringify({
          note: action.reason,
          status: action.status || "closed",
        }),
      });
    },
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["record", config.detailKind, id],
      });
    },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link className="text-sm text-primary-ink underline" to={config.basePath}>
        {t(config.titleKey)}
      </Link>
      <h1 className="text-xl font-semibold text-heading">
        {t("modules.screen.detail")}
      </h1>
      <Card>
        {record.data ? (
          Object.entries(record.data).map(([key, value]) => (
            <p key={key} className="break-words text-sm">
              <span className="font-semibold text-heading">{key}: </span>
              <span className="text-body">
                {typeof value === "string" ? value : JSON.stringify(value)}
              </span>
            </p>
          ))
        ) : (
          <p className="text-sm text-body">{t("common.state.loading")}</p>
        )}
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
            <TextField
              label={t("modules.screen.edit")}
              name="edit"
              value={edit}
              onChange={(event) => setEdit(event.target.value)}
              required
            />
            <div>
              <Button type="submit" loading={saveEdit.isPending}>
                {t("common.action.save")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {canPay ? (
        <Card>
          <form
            aria-label={t("modules.action.payClaim")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              payClaim.mutate();
            }}
          >
            <p className="text-sm text-body">
              {t("modules.action.payClaimHint")}
            </p>
            <TextField
              label={t("modules.field.period")}
              name="periodId"
              value={pay.periodId}
              onChange={(event) =>
                setPay((current) => ({
                  ...current,
                  periodId: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <TextField
              label={t("modules.field.expenseAccount")}
              name="expenseAccountId"
              value={pay.expenseAccountId}
              onChange={(event) =>
                setPay((current) => ({
                  ...current,
                  expenseAccountId: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <TextField
              label={t("modules.field.cashAccount")}
              name="cashAccountId"
              value={pay.cashAccountId}
              onChange={(event) =>
                setPay((current) => ({
                  ...current,
                  cashAccountId: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <TextField
              label={t("modules.field.amount")}
              name="amount"
              inputMode="decimal"
              value={pay.amount}
              onChange={(event) =>
                setPay((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <TextField
              label={t("modules.field.reason")}
              name="payReason"
              value={pay.reason}
              onChange={(event) =>
                setPay((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <div>
              <Button
                type="submit"
                variant="danger"
                loading={payClaim.isPending}
              >
                {t("modules.action.payClaim")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {canSchedule ? (
        <Card>
          <form
            aria-label={t("modules.action.schedule")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              generateSchedule.mutate();
            }}
          >
            <p className="text-sm text-body">
              {t("modules.action.scheduleHint")}
            </p>
            <TextField
              label={t("modules.field.principal")}
              name="principal"
              inputMode="decimal"
              value={schedule.principal}
              onChange={(event) =>
                setSchedule((current) => ({
                  ...current,
                  principal: event.target.value,
                }))
              }
              required
              autoComplete="off"
            />
            <TextField
              label={t("modules.field.startOn")}
              name="startOn"
              type="date"
              value={schedule.startOn}
              onChange={(event) =>
                setSchedule((current) => ({
                  ...current,
                  startOn: event.target.value,
                }))
              }
              required
            />
            <div>
              <Button type="submit" loading={generateSchedule.isPending}>
                {t("modules.action.schedule")}
              </Button>
            </div>
          </form>
          {scheduleLines.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {scheduleLines.map((line) => (
                <li
                  key={line.installmentNo}
                  className="break-words text-sm text-body"
                >
                  {line.installmentNo}. {line.dueOn} ·{" "}
                  {t("modules.field.principal")} {line.principal}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      {canMatch ? (
        <Card>
          <form
            aria-label={t("modules.action.match")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              matchLine.mutate();
            }}
          >
            <p className="text-sm text-body">{t("modules.action.matchHint")}</p>
            <TextField
              label={t("modules.field.journalLine")}
              name="journalLineId"
              value={journalLineId}
              onChange={(event) => setJournalLineId(event.target.value)}
              required
              autoComplete="off"
            />
            <div>
              <Button
                type="submit"
                variant="danger"
                loading={matchLine.isPending}
              >
                {t("modules.action.match")}
              </Button>
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
              label={t("modules.field.reason")}
              name="reason"
              value={action.reason ?? ""}
              onChange={(event) =>
                setAction((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              required
            />
            {config.detailAction === "decision" ? (
              <TextField
                label={t("modules.nav.approvals")}
                name="decision"
                value={action.decision ?? "approve"}
                onChange={(event) =>
                  setAction((current) => ({
                    ...current,
                    decision: event.target.value,
                  }))
                }
              />
            ) : (
              <TextField
                label={t("modules.field.statusCode")}
                name="status"
                value={action.status ?? "closed"}
                onChange={(event) =>
                  setAction((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              />
            )}
            <div>
              <Button type="submit" loading={runAction.isPending}>
                {t("common.action.save")}
              </Button>
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
        titleKey: "modules.welfare.title",
        hintKey: "modules.welfare.hint",
        listPath: "/api/v1/welfare-schemes",
        basePath: "/welfare",
        detailKind: "welfareScheme",
        createPath: "/api/v1/welfare-schemes",
        readPermission: "welfare.read",
        writePermission: "welfare.write",
        fields: [{ name: "name", labelKey: "modules.field.name" }],
      }}
    />
  );
}

export function ClaimsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.welfare.title",
        hintKey: "modules.welfare.hint",
        listPath: "/api/v1/claims",
        basePath: "/welfare/claims",
        detailKind: "claim",
        createPath: "/api/v1/claims",
        readPermission: "welfare.read",
        writePermission: "welfare.write",
        fields: [
          { name: "memberId", labelKey: "modules.field.memberNo" },
          { name: "schemeVersionId", labelKey: "modules.welfare.title" },
          { name: "idempotencyKey", labelKey: "modules.field.reason" },
        ],
      }}
    />
  );
}

export function ApprovalsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.nav.approvals",
        hintKey: "modules.notice",
        listPath: "/api/v1/approval-requests",
        basePath: "/approvals",
        detailKind: "approvalRequest",
        createPath: "/api/v1/approval-requests",
        readPermission: "approvals.read",
        writePermission: "welfare.write",
        detailAction: "decision",
        fields: [
          { name: "objectType", labelKey: "modules.field.name" },
          { name: "objectId", labelKey: "modules.field.reason" },
        ],
      }}
    />
  );
}

export function LoansPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.loans.title",
        hintKey: "modules.loans.hint",
        listPath: "/api/v1/loan-products",
        basePath: "/loans",
        detailKind: "loanProduct",
        createPath: "/api/v1/loan-products",
        readPermission: "loans.read",
        writePermission: "loans.write",
        links: [
          { to: "/loans/applications", labelKey: "modules.loans.applications" },
        ],
        fields: [{ name: "name", labelKey: "modules.field.name" }],
      }}
    />
  );
}

export function LoanApplicationsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.loans.applications",
        hintKey: "modules.loans.hint",
        listPath: "/api/v1/loan-applications",
        basePath: "/loans/applications",
        detailKind: "loanApplication",
        readPermission: "loans.read",
        fields: [],
      }}
    />
  );
}

export function BankLinesPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.finance.bankLines",
        hintKey: "modules.finance.bank",
        listPath: "/api/v1/bank-statement-lines",
        basePath: "/bank-lines",
        detailKind: "bankStatementLine",
        readPermission: "ledger.read",
        fields: [],
      }}
    />
  );
}

export function GovernancePage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.governance.title",
        hintKey: "modules.governance.hint",
        listPath: "/api/v1/committees",
        basePath: "/governance",
        detailKind: "committee",
        createPath: "/api/v1/committees",
        readPermission: "governance.read",
        writePermission: "governance.write",
        editPath: "/api/v1/committees",
        fields: [{ name: "name", labelKey: "modules.field.name" }],
      }}
    />
  );
}

export function ProjectsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.projects.title",
        hintKey: "modules.projects.hint",
        listPath: "/api/v1/projects",
        basePath: "/projects",
        detailKind: "project",
        createPath: "/api/v1/projects",
        readPermission: "projects.read",
        writePermission: "projects.write",
        fields: [
          { name: "name", labelKey: "modules.field.name" },
          { name: "category", labelKey: "modules.field.categoryCode" },
        ],
      }}
    />
  );
}

export function SuggestionsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.projects.title",
        hintKey: "modules.projects.hint",
        listPath: "/api/v1/suggestions",
        basePath: "/suggestions",
        detailKind: "suggestion",
        createPath: "/api/v1/suggestions",
        readPermission: "projects.read",
        writePermission: "projects.write",
        fields: [
          { name: "memberId", labelKey: "modules.field.memberNo" },
          { name: "body", labelKey: "modules.field.description" },
        ],
      }}
    />
  );
}

export function EmergencyPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.emergency.title",
        hintKey: "modules.emergency.hint",
        listPath: "/api/v1/emergency-requests",
        basePath: "/emergency",
        detailKind: "emergencyRequest",
        createPath: "/api/v1/emergency-requests",
        readPermission: "emergency.read",
        writePermission: "emergency.write",
        detailAction: "emergency",
        fields: [
          { name: "memberId", labelKey: "modules.field.memberNo" },
          { name: "requestType", labelKey: "modules.field.requestType" },
          { name: "phone", labelKey: "modules.field.phone" },
          { name: "idempotencyKey", labelKey: "modules.field.reason" },
        ],
      }}
    />
  );
}

export function EsgPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.esg.title",
        hintKey: "modules.esg.hint",
        listPath: "/api/v1/esg-goals",
        basePath: "/esg",
        detailKind: "esgGoal",
        createPath: "/api/v1/esg-goals",
        readPermission: "esg.read",
        writePermission: "esg.write",
        fields: [{ name: "name", labelKey: "modules.field.name" }],
      }}
    />
  );
}

export function NotificationsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.nav.notifications",
        hintKey: "modules.notice",
        listPath: "/api/v1/notification-templates",
        basePath: "/notifications",
        detailKind: "notificationTemplate",
        createPath: "/api/v1/notification-templates",
        readPermission: "notifications.read",
        writePermission: "notifications.write",
        editPath: "/api/v1/notification-templates",
        editBodyKey: "body",
        fields: [
          { name: "code", labelKey: "modules.field.name" },
          { name: "language", labelKey: "common.language.label" },
          { name: "body", labelKey: "modules.field.description" },
        ],
      }}
    />
  );
}
