import { useEffect, useState } from "react";
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
  detailAction?: "decision" | "emergency" | "suggestion" | "close" | "import" | "dispose";
  editFields?: Field[];
  editPermission?: string;
  publish?: boolean;
  links?: { to: string; labelKey: string }[];
};

const fieldLabels: Record<string, string> = {
  name: "modules.field.name",
  memberNo: "modules.field.memberNo",
  status: "modules.field.statusCode",
  statusCode: "modules.field.statusCode",
  category: "modules.field.categoryCode",
  categoryCode: "modules.field.categoryCode",
  body: "modules.field.description",
  description: "modules.field.description",
  amount: "modules.field.amount",
  phone: "modules.field.phone",
  requestType: "modules.field.requestType",
  evidenceNote: "modules.field.evidence",
  eligibilityStatus: "modules.welfare.title",
  eligibilityReason: "modules.field.reason",
  code: "modules.field.name",
  language: "common.language.label",
  channel: "modules.nav.notifications",
  title: "modules.field.name",
  cost: "modules.finance.asset",
  journalLineId: "modules.field.journalLine",
  notices: "modules.nav.notifications",
  startsOn: "modules.field.startOn",
  endsOn: "modules.field.startOn",
  acquiredOn: "modules.field.startOn",
  usefulLifeYears: "modules.finance.depreciation",
  disposedAt: "modules.action.dispose",
  policyStatus: "modules.field.statusCode",
  objectType: "modules.field.name",
  objectId: "modules.field.reason",
  memberId: "modules.field.memberNo",
  accountId: "modules.field.accountCode",
};

const hiddenFields = new Set(["societyId", "createdBy", "updatedBy", "idempotencyKey", "ruleBody", "formulaBody"]);

function fieldText(key: string, value: unknown, t: (label: string) => string): string | null {
  if (hiddenFields.has(key) || !(key in fieldLabels)) return null;
  if (key === "notices" && Array.isArray(value)) {
    return value.length === 0 ? t("common.state.empty") : value.map((item) => t(String(item))).join(" · ");
  }
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value === null) return "—";
  return null;
}

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
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState("bookedOn,amount,description\n");
  const [dispose, setDispose] = useState({
    periodId: "",
    cashAccountId: "",
    assetAccountId: "",
    gainAccountId: "",
    lossAccountId: "",
    proceeds: "",
    reason: "",
  });
  const [quoteDays, setQuoteDays] = useState("0");
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editPermission = config.editPermission ?? config.writePermission;
  const canEdit =
    Boolean(config.editFields?.length) &&
    (editPermission ? (session.me?.permissions.includes(editPermission) ?? false) : false);
  const canPost = session.me?.permissions.includes("ledger.post") ?? false;
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
        : config.detailAction === "suggestion"
          ? (session.me?.permissions.includes("projects.write") ?? false)
          : false;
  const record = useQuery({
    queryKey: ["record", config.detailKind, id],
    queryFn: () =>
      client.request<Record<string, unknown>>(
        `/api/v1/records/${config.detailKind}/${id}`,
      ),
  });
  const editNames = config.editFields?.map((field) => field.name).join(",") ?? "";
  useEffect(() => {
    if (!record.data || !config.editFields) return;
    const next: Record<string, string> = {};
    for (const field of config.editFields) {
      const value = record.data[field.name];
      next[field.name] = typeof value === "string" ? value : "";
    }
    setEditDraft(next);
  }, [record.data, editNames, config.editFields]);
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
  const saveFields = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/records/${config.detailKind}/${id}`, {
        method: "PUT",
        body: JSON.stringify(editDraft),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({ queryKey: ["record", config.detailKind, id] });
    },
    onError: fail,
  });
  const publishVersion = useMutation({
    mutationFn: () => {
      const path = config.detailKind === "loanProduct" ? `/api/v1/loan-products/${id}/versions` : `/api/v1/welfare-schemes/${id}/versions`;
      return client.request(path, { method: "POST", body: JSON.stringify({ publish: true }) });
    },
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({ queryKey: ["record", config.detailKind, id] });
    },
    onError: fail,
  });
  const quoteSettlement = useMutation({
    mutationFn: () =>
      client.request<{ amount: string }>(`/api/v1/loan-applications/${id}/settlement`, {
        method: "POST",
        body: JSON.stringify({ days: Number(quoteDays) }),
      }),
    onSuccess: (result) => {
      setQuoteAmount(result.amount);
      setMessage(t("modules.saved"));
    },
    onError: fail,
  });
  const closePeriod = useMutation({
    mutationFn: () => client.request(`/api/v1/fiscal-periods/${id}/close`, { method: "POST" }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({ queryKey: ["record", config.detailKind, id] });
    },
    onError: fail,
  });
  const importCsv = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/bank-accounts/${id}/statement-import`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      }),
    onSuccess: () => setMessage(t("modules.saved")),
    onError: fail,
  });
  const disposeAsset = useMutation({
    mutationFn: () =>
      client.request(`/api/v1/assets/${id}/dispose`, {
        method: "POST",
        body: JSON.stringify(dispose),
      }),
    onSuccess: async () => {
      setMessage(t("modules.saved"));
      await queryClient.invalidateQueries({ queryKey: ["record", config.detailKind, id] });
    },
    onError: fail,
  });
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
      if (config.detailAction === "suggestion") {
        return client.request(`/api/v1/suggestions/${id}/decision`, {
          method: "POST",
          body: JSON.stringify({ status: action.decision || "accepted" }),
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
          <dl className="grid gap-3">
            {Object.entries(record.data).map(([key, value]) => {
              const text = fieldText(key, value, t);
              if (text === null) return null;
              return (
                <div key={key}>
                  <dt className="text-sm font-semibold text-heading">{t(fieldLabels[key] ?? key)}</dt>
                  <dd className="break-words text-sm text-body">{text}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-sm text-body">{t("common.state.loading")}</p>
        )}
      </Card>
      {canEdit && record.data?.status !== "paid" && record.data?.status !== "rejected" && !record.data?.disposedAt ? (
        <Card>
          <form
            aria-label={t("modules.screen.edit")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveFields.mutate();
            }}
          >
            {config.editFields?.map((field) => (
              <TextField
                key={field.name}
                label={t(field.labelKey)}
                name={field.name}
                value={editDraft[field.name] ?? ""}
                onChange={(event) => setEditDraft((current) => ({ ...current, [field.name]: event.target.value }))}
                required
                autoComplete="off"
              />
            ))}
            <div>
              <Button type="submit" loading={saveFields.isPending}>{t("common.action.save")}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {canWrite && config.publish ? (
        <div>
          <Button type="button" variant="secondary" loading={publishVersion.isPending} onClick={() => publishVersion.mutate()}>
            {t("modules.action.publish")}
          </Button>
        </div>
      ) : null}
      {config.detailAction === "close" && canPost ? (
        <Card>
          <form
            aria-label={t("modules.action.closePeriod")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              closePeriod.mutate();
            }}
          >
            <p className="text-sm text-body">{t("modules.action.closePeriodHint")}</p>
            <div>
              <Button type="submit" variant="danger" loading={closePeriod.isPending}>{t("modules.action.closePeriod")}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {config.detailAction === "import" && canPost ? (
        <Card>
          <form
            aria-label={t("modules.action.importStatement")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              importCsv.mutate();
            }}
          >
            <p className="text-sm text-body">{t("modules.action.importStatementHint")}</p>
            <label className="flex flex-col gap-1 text-sm" htmlFor="csv">
              <span className="font-medium text-heading">{t("modules.field.csv")}</span>
              <textarea
                id="csv"
                name="csv"
                required
                rows={6}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-base text-heading"
              />
            </label>
            <div>
              <Button type="submit" loading={importCsv.isPending}>{t("modules.action.importStatement")}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {config.detailAction === "dispose" && canPost && !record.data?.disposedAt ? (
        <Card>
          <form
            aria-label={t("modules.action.dispose")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              disposeAsset.mutate();
            }}
          >
            <p className="text-sm text-body">{t("modules.action.disposeHint")}</p>
            {(
              [
                ["periodId", "modules.field.period"],
                ["cashAccountId", "modules.field.cashAccount"],
                ["assetAccountId", "modules.field.assetAccount"],
                ["gainAccountId", "modules.field.gainAccount"],
                ["lossAccountId", "modules.field.lossAccount"],
                ["proceeds", "modules.field.proceeds"],
                ["reason", "modules.field.reason"],
              ] as const
            ).map(([name, label]) => (
              <TextField
                key={name}
                label={t(label)}
                name={name}
                value={dispose[name]}
                onChange={(event) => setDispose((current) => ({ ...current, [name]: event.target.value }))}
                required
                autoComplete="off"
              />
            ))}
            <div>
              <Button type="submit" variant="danger" loading={disposeAsset.isPending}>{t("modules.action.dispose")}</Button>
            </div>
          </form>
        </Card>
      ) : null}
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
      {config.detailKind === "loanApplication" && (session.me?.permissions.includes("loans.read") ?? false) ? (
        <Card>
          <form
            aria-label={t("modules.action.settlement")}
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              quoteSettlement.mutate();
            }}
          >
            <p className="text-sm text-body">{t("modules.action.settlementHint")}</p>
            <TextField
              label={t("modules.field.days")}
              name="days"
              inputMode="numeric"
              value={quoteDays}
              onChange={(event) => setQuoteDays(event.target.value)}
              required
            />
            <div>
              <Button type="submit" variant="secondary" loading={quoteSettlement.isPending}>{t("modules.action.settlement")}</Button>
            </div>
          </form>
          {quoteAmount ? <p className="mt-3 text-sm text-heading">{quoteAmount}</p> : null}
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
            {config.detailAction === "suggestion" ? null : (
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
            )}
            {config.detailAction === "decision" || config.detailAction === "suggestion" ? (
              <TextField
                label={t("modules.nav.approvals")}
                name="decision"
                value={action.decision ?? (config.detailAction === "suggestion" ? "accepted" : "approve")}
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
        publish: true,
        editFields: [{ name: "name", labelKey: "modules.field.name" }],
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
        editFields: [{ name: "evidenceNote", labelKey: "modules.field.evidence" }],
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
        publish: true,
        editFields: [{ name: "name", labelKey: "modules.field.name" }],
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

export function PeriodsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.finance.periods",
        hintKey: "modules.action.closePeriodHint",
        listPath: "/api/v1/fiscal-periods",
        basePath: "/ledger/periods",
        detailKind: "fiscalPeriod",
        readPermission: "ledger.read",
        detailAction: "close",
        fields: [],
      }}
    />
  );
}

export function BankAccountsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.finance.banks",
        hintKey: "modules.action.importStatementHint",
        listPath: "/api/v1/bank-accounts",
        basePath: "/ledger/banks",
        detailKind: "bankAccount",
        readPermission: "ledger.read",
        editPermission: "ledger.post",
        editFields: [{ name: "name", labelKey: "modules.field.name" }],
        detailAction: "import",
        fields: [],
      }}
    />
  );
}

export function AssetsPage() {
  return (
    <ModuleScreen
      config={{
        titleKey: "modules.finance.asset",
        hintKey: "modules.action.disposeHint",
        listPath: "/api/v1/assets",
        basePath: "/ledger/assets",
        detailKind: "fixedAsset",
        readPermission: "ledger.read",
        editPermission: "ledger.post",
        editFields: [{ name: "name", labelKey: "modules.field.name" }],
        detailAction: "dispose",
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
        editFields: [
          { name: "name", labelKey: "modules.field.name" },
          { name: "category", labelKey: "modules.field.categoryCode" },
        ],
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
        detailAction: "suggestion",
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
        editFields: [{ name: "name", labelKey: "modules.field.name" }],
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
