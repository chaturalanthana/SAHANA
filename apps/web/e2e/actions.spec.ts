import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const email = "admin.a@demo.sahana.test";
const approverEmail = "approver.a@demo.sahana.test";
const password = process.env.SEED_DEMO_PASSWORD;
const clientHeader = { "x-sahana-client": "web" };

test.beforeEach(() => {
  test.skip(!password, "SEED_DEMO_PASSWORD is not set");
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator("[data-language-menu]").click();
  await page.locator('[data-locale="en"]').click();
  await expect(
    page.getByRole("heading", { name: "Configuration" }),
  ).toBeVisible();
}

async function api<T>(
  page: Page,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(path, {
    method,
    headers: clientHeader,
    data,
  });
  const text = await response.text();
  expect(response.ok(), text).toBeTruthy();
  return JSON.parse(text) as T;
}

const viewports = [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 320, height: 720 },
] as const;

test("pays a claim, generates a loan schedule, and matches a bank line", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One sign-in covers 1280, 768, and 320. The login limit is 10 per 15 minutes.",
  );
  await signIn(page);
  const approverLogin = await request.post("/api/v1/auth/login", {
    headers: clientHeader,
    data: { email: approverEmail, password, client: "web" },
  });
  expect(approverLogin.ok(), await approverLogin.text()).toBeTruthy();

  for (const [index, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport);
    await exercise(page, request, `${index}-${Date.now()}`);
  }
});

async function exercise(
  page: Page,
  request: APIRequestContext,
  suffix: string,
) {
  const members = await api<{ items: { id: string; memberNo: string }[] }>(
    page,
    "GET",
    "/api/v1/members?page=1&pageSize=25",
  );
  const member = members.items.find((item) => item.memberNo === "DEMO-001");
  expect(member).toBeTruthy();
  const accounts = await api<{ items: { id: string; code: string }[] }>(
    page,
    "GET",
    "/api/v1/accounts?page=1&pageSize=100",
  );
  const cash = accounts.items.find((item) => item.code === "1000");
  const expense = accounts.items.find((item) => item.code === "5000");
  const income = accounts.items.find((item) => item.code === "4000");
  expect(cash && expense && income).toBeTruthy();

  const period = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/fiscal-periods",
    {
      name: `E2E ${suffix}`,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
    },
  );
  const scheme = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/welfare-schemes",
    { name: `E2E ${suffix}` },
  );
  const version = await api<{ id: string }>(
    page,
    "POST",
    `/api/v1/welfare-schemes/${scheme.id}/versions`,
    { publish: true },
  );
  const claim = await api<{ id: string }>(page, "POST", "/api/v1/claims", {
    memberId: member?.id,
    schemeVersionId: version.id,
    idempotencyKey: `e2e-${suffix}`,
    amount: "12.0000",
  });
  const approval = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/approval-requests",
    {
      objectType: "claim",
      objectId: claim.id,
    },
  );
  const decision = await request.post(
    `/api/v1/approval-requests/${approval.id}/decisions`,
    {
      headers: clientHeader,
      data: { stageNo: 1, decision: "approve", reason: "E2E approval" },
    },
  );
  expect(decision.ok(), await decision.text()).toBeTruthy();

  const product = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/loan-products",
    { name: `E2E ${suffix}` },
  );
  const loanVersion = await api<{ id: string }>(
    page,
    "POST",
    `/api/v1/loan-products/${product.id}/versions`,
    {
      publish: true,
      ruleBody: {
        annualRatePercent: "0.0000",
        termMonths: 12,
        flatFee: "0.0000",
      },
    },
  );
  const application = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/loan-applications",
    {
      memberId: member?.id,
      productVersionId: loanVersion.id,
    },
  );

  const bank = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/bank-accounts",
    {
      name: `E2E ${suffix}`,
      accountId: cash?.id,
    },
  );
  const journal = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/journal-documents",
    {
      periodId: period.id,
      reason: `E2E match ${suffix}`,
    },
  );
  const debit = await api<{ id: string }>(
    page,
    "POST",
    `/api/v1/journal-documents/${journal.id}/lines`,
    {
      accountId: cash?.id,
      debit: "18.0000",
      credit: "0.0000",
    },
  );
  await api(page, "POST", `/api/v1/journal-documents/${journal.id}/lines`, {
    accountId: income?.id,
    debit: "0.0000",
    credit: "18.0000",
  });
  await api(page, "POST", `/api/v1/journal-documents/${journal.id}/post`);
  const statement = await api<{ id: string }>(
    page,
    "POST",
    "/api/v1/bank-statement-lines",
    {
      bankAccountId: bank.id,
      bookedOn: "2026-04-01",
      amount: "18.0000",
      description: `E2E ${suffix}`,
    },
  );

  await page.goto(`/welfare/claims/${claim.id}`);
  const pay = page.getByRole("form", { name: "Pay claim" });
  await expect(pay).toBeVisible();
  await pay.getByLabel("Period").fill(period.id);
  await pay.getByLabel("Expense account").fill(expense?.id ?? "");
  await pay.getByLabel("Cash account").fill(cash?.id ?? "");
  await pay.getByLabel("Amount").fill("12.0000");
  await pay.getByLabel("Reason").fill("E2E payment");
  await pay.getByRole("button", { name: "Pay claim" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText("paid", { exact: true })).toBeVisible();

  await page.goto("/loans");
  await expect(
    page.getByRole("link", { name: "Loan applications" }),
  ).toBeVisible();
  await page.goto(`/loans/applications/${application.id}`);
  const schedule = page.getByRole("form", { name: "Generate schedule" });
  await expect(schedule).toBeVisible();
  await schedule.getByLabel("Principal").fill("1200.0000");
  await schedule.getByLabel("Start date").fill("2026-03-01");
  await schedule.getByRole("button", { name: "Generate schedule" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(
    page.getByText("1. 2026-04-01 · Principal 100.0000"),
  ).toBeVisible();
  const quote = page.getByRole("form", { name: "Settlement quote" });
  await quote.getByLabel("Days").fill("10");
  await quote.getByRole("button", { name: "Settlement quote" }).click();
  await expect(page.getByText("1200.0000")).toBeVisible();

  await page.goto("/ledger");
  await expect(
    page.getByRole("link", { name: "Bank statement lines" }),
  ).toBeVisible();
  await page.goto(`/bank-lines/${statement.id}`);
  const match = page.getByRole("form", { name: "Match bank line" });
  await expect(match).toBeVisible();
  await match.getByLabel("Journal line").fill(debit.id);
  await match.getByRole("button", { name: "Match bank line" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText(debit.id)).toBeVisible();

  if (!suffix.startsWith("0-")) return;
  await page.goto(`/ledger/banks/${bank.id}`);
  const importer = page.getByRole("form", { name: "Import statement" });
  await importer
    .getByLabel("Statement file")
    .fill("bookedOn,amount,description\n2026-05-02,4.0000,Desk line");
  await importer.getByRole("button", { name: "Import statement" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  const assetAccount = await api<{ id: string }>(page, "POST", "/api/v1/accounts", {
    code: `A${suffix.replace(/\D/g, "").slice(-6)}`,
    name: "E2E asset",
    accountType: "asset",
  });
  const asset = await api<{ id: string }>(page, "POST", "/api/v1/assets", {
    name: `Cupboard ${suffix}`,
    cost: "80.0000",
    acquiredOn: "2026-01-01",
  });
  await page.goto(`/ledger/assets/${asset.id}`);
  const disposal = page.getByRole("form", { name: "Dispose asset" });
  await disposal.getByLabel("Period").fill(period.id);
  await disposal.getByLabel("Cash account").fill(cash?.id ?? "");
  await disposal.getByLabel("Asset account").fill(assetAccount.id);
  await disposal.getByLabel("Gain account").fill(income?.id ?? "");
  await disposal.getByLabel("Loss account").fill(expense?.id ?? "");
  await disposal.getByLabel("Proceeds").fill("80.0000");
  await disposal.getByLabel("Reason").fill("E2E disposal");
  await disposal.getByRole("button", { name: "Dispose asset" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.goto(`/ledger/periods/${period.id}`);
  await page.getByRole("button", { name: "Close period" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText("closed", { exact: true })).toBeVisible();
}
