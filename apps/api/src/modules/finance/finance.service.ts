import { Prisma } from '@prisma/client';
import { withSociety, type Scope } from '../../db';
import { annualDepreciation, budgetVariance, buildStatements, carryingAmount, parseStatementCsv, type StatementAccount } from '../../domain/statements';
import { ApiError } from '../../errors';

function minor(value: Prisma.Decimal | string): bigint {
  const text = value.toString();
  const negative = text.startsWith('-');
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const amount = BigInt(whole || '0') * 10000n + BigInt((frac + '0000').slice(0, 4));
  return negative ? -amount : amount;
}

function textMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`;
}

async function postedLines(scope: Scope, periodId?: string) {
  return withSociety(scope, async (tx) => {
    const documents = await tx.journalDocument.findMany({
      where: { societyId: scope.societyId, status: 'posted', ...(periodId ? { periodId } : {}) },
      select: { id: true },
    });
    const accounts = await tx.account.findMany({ where: { societyId: scope.societyId } });
    const lines = await tx.journalLine.findMany({
      where: { societyId: scope.societyId, documentId: { in: documents.map((item) => item.id) } },
    });
    return { accounts, lines };
  });
}

export async function statements(scope: Scope, periodId?: string) {
  const { accounts, lines } = await postedLines(scope, periodId);
  const totals = new Map<string, { debit: bigint; credit: bigint }>();
  for (const line of lines) {
    const current = totals.get(line.accountId) ?? { debit: 0n, credit: 0n };
    current.debit += minor(line.debit);
    current.credit += minor(line.credit);
    totals.set(line.accountId, current);
  }
  const items: StatementAccount[] = accounts.map((account) => {
    const sum = totals.get(account.id) ?? { debit: 0n, credit: 0n };
    return {
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      isCash: account.isCash,
      debit: textMoney(sum.debit),
      credit: textMoney(sum.credit),
    };
  });
  return buildStatements(items);
}

export async function memberLedger(scope: Scope, memberId: string, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { id: memberId, societyId: scope.societyId } });
    if (!member) throw new ApiError(404, 'not_found', 'errors.notFound');
    const where = { societyId: scope.societyId, memberId };
    const [total, items] = await Promise.all([
      tx.journalLine.count({ where }),
      tx.journalLine.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'asc' } }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        debit: item.debit.toString(),
        credit: item.credit.toString(),
        accountId: item.accountId,
      })),
    };
  });
}

export async function fundLedger(scope: Scope, fundId: string, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const fund = await tx.fund.findFirst({ where: { id: fundId, societyId: scope.societyId } });
    if (!fund) throw new ApiError(404, 'not_found', 'errors.notFound');
    const where = { societyId: scope.societyId, fundId };
    const [total, items] = await Promise.all([
      tx.journalLine.count({ where }),
      tx.journalLine.findMany({ where, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      page,
      pageSize,
      total,
      fund: { id: fund.id, name: fund.name },
      items: items.map((item) => ({ id: item.id, debit: item.debit.toString(), credit: item.credit.toString() })),
    };
  });
}

export async function createFund(scope: Scope, name: string, traceId: string) {
  return withSociety(scope, async (tx) => {
    const created = await tx.fund.create({ data: { societyId: scope.societyId, name, createdBy: scope.userId } });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.fund_created',
        objectType: 'fund',
        objectId: created.id,
        traceId,
        detail: {},
      },
    });
    return { id: created.id, name: created.name };
  });
}

export async function listFunds(scope: Scope, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const where = { societyId: scope.societyId };
    const [total, items] = await Promise.all([
      tx.fund.count({ where }),
      tx.fund.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
    ]);
    return { page, pageSize, total, items };
  });
}

export async function createBankAccount(scope: Scope, input: { name: string; accountId: string }, traceId: string) {
  return withSociety(scope, async (tx) => {
    const account = await tx.account.findFirst({ where: { id: input.accountId, societyId: scope.societyId } });
    if (!account) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.bankAccount.create({
      data: { societyId: scope.societyId, name: input.name, accountId: input.accountId, createdBy: scope.userId },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.bank_opened',
        objectType: 'bank_account',
        objectId: created.id,
        traceId,
        detail: {},
      },
    });
    return { id: created.id, name: created.name, accountId: created.accountId };
  });
}

export async function addStatementLine(
  scope: Scope,
  input: { bankAccountId: string; bookedOn: string; amount: string; description: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const bank = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, societyId: scope.societyId } });
    if (!bank) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.bankStatementLine.create({
      data: {
        societyId: scope.societyId,
        bankAccountId: input.bankAccountId,
        bookedOn: new Date(input.bookedOn),
        amount: new Prisma.Decimal(input.amount),
        description: input.description,
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.statement_imported',
        objectType: 'bank_statement_line',
        objectId: created.id,
        traceId,
        detail: {},
      },
    });
    return { id: created.id };
  });
}

export async function matchStatement(scope: Scope, lineId: string, journalLineId: string, traceId: string) {
  return withSociety(scope, async (tx) => {
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, societyId: scope.societyId } });
    const journal = await tx.journalLine.findFirst({ where: { id: journalLineId, societyId: scope.societyId } });
    if (!line || !journal) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (line.journalLineId) throw new ApiError(409, 'conflict', 'modules.error.immutable');
    const bank = await tx.bankAccount.findFirst({ where: { id: line.bankAccountId, societyId: scope.societyId } });
    if (!bank || journal.accountId !== bank.accountId) throw new ApiError(409, 'conflict', 'errors.validation');
    const net = minor(journal.debit) - minor(journal.credit);
    if (net !== minor(line.amount)) throw new ApiError(409, 'conflict', 'modules.error.unbalanced');
    await tx.bankStatementLine.update({ where: { id: lineId }, data: { journalLineId } });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.reconciled',
        objectType: 'bank_statement_line',
        objectId: lineId,
        traceId,
        detail: { journalLineId },
      },
    });
    return { id: lineId, journalLineId };
  });
}

export async function reconciliation(scope: Scope, bankAccountId: string) {
  return withSociety(scope, async (tx) => {
    const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, societyId: scope.societyId } });
    if (!bank) throw new ApiError(404, 'not_found', 'errors.notFound');
    const lines = await tx.bankStatementLine.findMany({
      where: { societyId: scope.societyId, bankAccountId },
      orderBy: { bookedOn: 'asc' },
      take: 100,
    });
    return {
      unmatched: lines
        .filter((line) => !line.journalLineId)
        .map((line) => ({ id: line.id, amount: line.amount.toString(), description: line.description })),
      matched: lines.filter((line) => line.journalLineId).length,
    };
  });
}

export async function createBudget(
  scope: Scope,
  input: { name: string; accountId: string; periodId: string; amount: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const account = await tx.account.findFirst({ where: { id: input.accountId, societyId: scope.societyId } });
    const period = await tx.fiscalPeriod.findFirst({ where: { id: input.periodId, societyId: scope.societyId } });
    if (!account || !period) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.budget.create({
      data: {
        societyId: scope.societyId,
        name: input.name,
        accountId: input.accountId,
        periodId: input.periodId,
        amount: new Prisma.Decimal(input.amount),
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.budget_recorded',
        objectType: 'budget',
        objectId: created.id,
        traceId,
        detail: {},
      },
    });
    return { id: created.id };
  });
}

export async function budgetReport(scope: Scope, budgetId: string) {
  const budget = await withSociety(scope, (tx) =>
    tx.budget.findFirst({ where: { id: budgetId, societyId: scope.societyId } }),
  );
  if (!budget) throw new ApiError(404, 'not_found', 'errors.notFound');
  const { lines } = await postedLines(scope, budget.periodId);
  const actual = lines
    .filter((line) => line.accountId === budget.accountId)
    .reduce((total, line) => total + minor(line.debit) - minor(line.credit), 0n);
  const actualText = textMoney(actual);
  return {
    id: budget.id,
    name: budget.name,
    amount: budget.amount.toString(),
    actual: actualText,
    variance: budgetVariance(budget.amount.toString(), actualText),
  };
}

export async function createAsset(
  scope: Scope,
  input: { name: string; cost: string; acquiredOn: string; usefulLifeYears?: number },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.fixedAsset.create({
      data: {
        societyId: scope.societyId,
        name: input.name,
        cost: new Prisma.Decimal(input.cost),
        acquiredOn: new Date(input.acquiredOn),
        usefulLifeYears: input.usefulLifeYears,
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.asset_recorded',
        objectType: 'fixed_asset',
        objectId: created.id,
        traceId,
        detail: {},
      },
    });
    return {
      id: created.id,
      annualDepreciation: annualDepreciation(input.cost, input.usefulLifeYears ?? null),
    };
  });
}

export async function listAssets(scope: Scope, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const where = { societyId: scope.societyId };
    const [total, rows] = await Promise.all([
      tx.fixedAsset.count({ where }),
      tx.fixedAsset.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((item) => ({
        id: item.id,
        name: item.name,
        cost: item.cost.toString(),
        annualDepreciation: annualDepreciation(item.cost.toString(), item.usefulLifeYears),
      })),
    };
  });
}

export async function listBankAccounts(scope: Scope, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const where = { societyId: scope.societyId };
    const [total, items] = await Promise.all([
      tx.bankAccount.count({ where }),
      tx.bankAccount.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({ id: item.id, name: item.name, accountId: item.accountId })),
    };
  });
}

export async function listStatementLines(scope: Scope, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    const where = { societyId: scope.societyId };
    const [total, items] = await Promise.all([
      tx.bankStatementLine.count({ where }),
      tx.bankStatementLine.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { bookedOn: 'desc' },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        amount: item.amount.toString(),
        description: item.description,
        journalLineId: item.journalLineId,
      })),
    };
  });
}

export async function importStatementCsv(scope: Scope, bankAccountId: string, csv: string, traceId: string) {
  let rows: { bookedOn: string; amount: string; description: string }[];
  try {
    rows = parseStatementCsv(csv);
  } catch {
    throw new ApiError(400, 'validation', 'errors.validation');
  }
  if (rows.length === 0 || rows.length > 500) throw new ApiError(400, 'validation', 'errors.validation');
  return withSociety(scope, async (tx) => {
    const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, societyId: scope.societyId } });
    if (!bank) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = [];
    for (const row of rows) {
      const line = await tx.bankStatementLine.create({
        data: {
          societyId: scope.societyId,
          bankAccountId,
          bookedOn: new Date(row.bookedOn),
          amount: new Prisma.Decimal(row.amount),
          description: row.description,
          createdBy: scope.userId,
        },
      });
      created.push(line.id);
    }
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.statement_imported',
        objectType: 'bank_account',
        objectId: bankAccountId,
        traceId,
        detail: { count: created.length },
      },
    });
    return { created: created.length };
  });
}

export async function disposeAsset(
  scope: Scope,
  assetId: string,
  input: { periodId: string; cashAccountId: string; assetAccountId: string; gainAccountId: string; lossAccountId: string; proceeds: string; reason: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const asset = await tx.fixedAsset.findFirst({ where: { id: assetId, societyId: scope.societyId } });
    if (!asset) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (asset.disposedAt) throw new ApiError(409, 'conflict', 'modules.error.immutable');
    const period = await tx.fiscalPeriod.findFirst({ where: { id: input.periodId, societyId: scope.societyId } });
    if (!period || period.status === 'closed') throw new ApiError(409, 'period_closed', 'modules.error.periodClosed');
    const carrying = carryingAmount(asset.cost.toString(), asset.usefulLifeYears, asset.acquiredOn, new Date());
    const proceeds = minor(input.proceeds);
    const carryingMinor = minor(carrying);
    const document = await tx.journalDocument.create({
      data: { societyId: scope.societyId, periodId: input.periodId, reason: input.reason, createdBy: scope.userId },
    });
    const lines: { accountId: string; debit: bigint; credit: bigint }[] = [
      { accountId: input.cashAccountId, debit: proceeds, credit: 0n },
      { accountId: input.assetAccountId, debit: 0n, credit: carryingMinor },
    ];
    if (proceeds > carryingMinor) lines.push({ accountId: input.gainAccountId, debit: 0n, credit: proceeds - carryingMinor });
    if (proceeds < carryingMinor) lines.push({ accountId: input.lossAccountId, debit: carryingMinor - proceeds, credit: 0n });
    for (const line of lines) {
      if (line.debit === 0n && line.credit === 0n) continue;
      await tx.journalLine.create({
        data: {
          societyId: scope.societyId,
          documentId: document.id,
          accountId: line.accountId,
          debit: textMoney(line.debit),
          credit: textMoney(line.credit),
        },
      });
    }
    await tx.$executeRaw`SELECT app_post_journal(${document.id}::uuid, ${scope.societyId}::uuid, ${scope.userId}::uuid)`;
    await tx.fixedAsset.update({ where: { id: assetId }, data: { disposedAt: new Date() } });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.asset_disposed',
        objectType: 'fixed_asset',
        objectId: assetId,
        traceId,
        detail: { journalDocumentId: document.id },
      },
    });
    return { id: assetId, journalDocumentId: document.id, carrying };
  });
}

export async function createInvestment(
  scope: Scope,
  input: { name: string; cost: string; acquiredOn: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.investment.create({
      data: {
        societyId: scope.societyId,
        name: input.name,
        cost: new Prisma.Decimal(input.cost),
        acquiredOn: new Date(input.acquiredOn),
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'ledger.investment_recorded',
        objectType: 'investment',
        objectId: created.id,
        traceId,
        detail: { note: 'recorded_cost' },
      },
    });
    return { id: created.id, cost: input.cost, valuation: 'recorded_cost' };
  });
}
