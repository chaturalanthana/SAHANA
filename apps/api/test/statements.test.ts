import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { annualDepreciation, budgetVariance } from '../src/domain/statements';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('statement math', () => {
  it('does not invent depreciation without a useful life', () => {
    expect(annualDepreciation('100.0000', null)).toBeNull();
    expect(annualDepreciation('100.0000', 5)).toBe('20.0000');
    expect(budgetVariance('100.0000', '40.0000')).toBe('60.0000');
  });
});

describe('financial statements', () => {
  beforeEach(() => resetRateLimits());

  it('reports surplus, matches a bank line, and compares a budget', async () => {
    const society = await prisma.society.create({ data: { name: 'Statements Society' } });
    const user = await prisma.user.create({
      data: { email: 'statements@example.test', displayName: 'Statements', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'books', name: 'Books' } });
    for (const code of ['ledger.read', 'ledger.post', 'members.read', 'members.write']) {
      const permission = await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });
    const signedIn = await request(app)
      .post('/api/v1/auth/login')
      .set('x-sahana-client', 'web')
      .send({ email: user.email, password, client: 'web' });
    const headers = { cookie: signedIn.headers['set-cookie']?.[0] ?? '', 'x-sahana-client': 'web' };
    await request(app).post('/api/v1/ledger/chart').set(headers);
    const accounts = await request(app).get('/api/v1/accounts?pageSize=100').set(headers);
    const cash = accounts.body.items.find((item: { code: string }) => item.code === '1000');
    const income = accounts.body.items.find((item: { code: string }) => item.code === '4000');
    const expense = accounts.body.items.find((item: { code: string }) => item.code === '5000');
    const period = await request(app)
      .post('/api/v1/fiscal-periods')
      .set(headers)
      .send({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const member = await request(app)
      .post('/api/v1/members')
      .set(headers)
      .send({ memberNo: 'S-1', givenName: 'Nimal', familyName: 'Perera', statusCode: 'applied', categoryCode: 'employee' });
    const fund = await request(app).post('/api/v1/funds').set(headers).send({ name: 'Welfare fund' });
    const journal = await request(app)
      .post('/api/v1/journal-documents')
      .set(headers)
      .send({ periodId: period.body.id, reason: 'Contribution' });
    await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/lines`)
      .set(headers)
      .send({ accountId: cash.id, debit: '25.0000', fundId: fund.body.id, memberId: member.body.id });
    await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/lines`)
      .set(headers)
      .send({ accountId: income.id, credit: '25.0000', fundId: fund.body.id });
    expect((await request(app).post(`/api/v1/journal-documents/${journal.body.id}/post`).set(headers)).status).toBe(200);

    const report = await request(app).get('/api/v1/reports/statements').set(headers);
    expect(report.status).toBe(200);
    expect(report.body.incomeExpenditure.surplus).toBe('25.0000');
    expect(report.body.cashFlow.net).toBe('25.0000');
    expect(report.body.balanceSheet.balanced).toBe(true);

    const memberLines = await request(app).get(`/api/v1/members/${member.body.id}/ledger`).set(headers);
    expect(memberLines.body.total).toBe(1);
    const fundLines = await request(app).get(`/api/v1/funds/${fund.body.id}/ledger`).set(headers);
    expect(fundLines.body.total).toBe(2);

    const bank = await request(app).post('/api/v1/bank-accounts').set(headers).send({ name: 'Main', accountId: cash.id });
    const statement = await request(app).post('/api/v1/bank-statement-lines').set(headers).send({
      bankAccountId: bank.body.id,
      bookedOn: '2026-02-01',
      amount: '25.0000',
      description: 'Contribution',
    });
    const cashLine = await prisma.journalLine.findFirst({ where: { documentId: journal.body.id, accountId: cash.id } });
    const matched = await request(app)
      .post(`/api/v1/bank-statement-lines/${statement.body.id}/match`)
      .set(headers)
      .send({ journalLineId: cashLine?.id });
    expect(matched.status).toBe(200);
    const open = await request(app).get(`/api/v1/bank-accounts/${bank.body.id}/reconciliation`).set(headers);
    expect(open.body.unmatched).toEqual([]);
    expect(open.body.matched).toBe(1);

    const budget = await request(app).post('/api/v1/budgets').set(headers).send({
      name: 'Welfare spend',
      accountId: expense.id,
      periodId: period.body.id,
      amount: '100.0000',
    });
    const compared = await request(app).get(`/api/v1/budgets/${budget.body.id}`).set(headers);
    expect(compared.body.variance).toBe('100.0000');

    const asset = await request(app)
      .post('/api/v1/assets')
      .set(headers)
      .send({ name: 'Cupboard', cost: '100.0000', acquiredOn: '2026-01-01', usefulLifeYears: 5 });
    expect(asset.body.annualDepreciation).toBe('20.0000');
    const holding = await request(app)
      .post('/api/v1/investments')
      .set(headers)
      .send({ name: 'Deposit', cost: '50.0000', acquiredOn: '2026-01-01' });
    expect(holding.body.valuation).toBe('recorded_cost');
  });
});
