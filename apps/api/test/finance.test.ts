import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { buildSchedule, DEFAULT_LOAN_RULE } from '../src/domain/loans';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('loan schedule', () => {
  it('keeps a zero-rate schedule equal to principal', () => {
    const lines = buildSchedule('1200.0000', { ...DEFAULT_LOAN_RULE, termMonths: 12 }, new Date('2026-01-31'));
    const total = lines.reduce((sum, line) => sum + Number(line.principal), 0);
    expect(total).toBe(1200);
    expect(lines.every((line) => line.interest === '0.0000')).toBe(true);
  });
});

describe('ledger', () => {
  beforeEach(() => resetRateLimits());

  it('balances a receipt, preserves a reversal, and pays a claim once', async () => {
    const society = await prisma.society.create({ data: { name: 'Finance Society' } });
    const user = await prisma.user.create({
      data: { email: 'finance@example.test', displayName: 'Finance', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'finance', name: 'Finance' } });
    for (const code of ['ledger.read', 'ledger.post', 'loans.read', 'loans.write', 'members.read', 'members.write', 'welfare.read', 'welfare.write']) {
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
    const cookie = signedIn.headers['set-cookie']?.[0] ?? '';
    const headers = { cookie, 'x-sahana-client': 'web' };
    await request(app).post('/api/v1/ledger/chart').set(headers);
    const accounts = await request(app).get('/api/v1/accounts?pageSize=100').set(headers);
    const cash = accounts.body.items.find((item: { code: string }) => item.code === '1000');
    const income = accounts.body.items.find((item: { code: string }) => item.code === '4000');
    const expense = accounts.body.items.find((item: { code: string }) => item.code === '5000');
    const period = await request(app)
      .post('/api/v1/fiscal-periods')
      .set(headers)
      .send({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const receipt = await request(app)
      .post('/api/v1/journal-documents')
      .set(headers)
      .send({ periodId: period.body.id, reason: 'Opening receipt' });
    await request(app)
      .post(`/api/v1/journal-documents/${receipt.body.id}/lines`)
      .set(headers)
      .send({ accountId: cash.id, debit: '25.0000' });
    await request(app)
      .post(`/api/v1/journal-documents/${receipt.body.id}/lines`)
      .set(headers)
      .send({ accountId: income.id, credit: '25.0000' });
    const posted = await request(app).post(`/api/v1/journal-documents/${receipt.body.id}/post`).set(headers);
    expect(posted.status).toBe(200);
    const balance = await request(app).get('/api/v1/reports/trial-balance').set(headers);
    expect(balance.body.balanced).toBe(true);
    expect(balance.body.debit).toBe(balance.body.credit);
    const reversal = await request(app)
      .post(`/api/v1/journal-documents/${receipt.body.id}/reverse`)
      .set(headers)
      .send({ reason: 'Correct the opening receipt' });
    expect(reversal.status).toBe(201);
    const original = await prisma.journalDocument.findUnique({ where: { id: receipt.body.id } });
    expect(original?.status).toBe('posted');

    const member = await request(app)
      .post('/api/v1/members')
      .set(headers)
      .send({ memberNo: 'F-1', givenName: 'Nimal', familyName: 'Perera', statusCode: 'applied', categoryCode: 'employee' });
    const scheme = await request(app).post('/api/v1/welfare-schemes').set(headers).send({ name: 'Aid' });
    const version = await request(app).post(`/api/v1/welfare-schemes/${scheme.body.id}/versions`).set(headers).send({});
    const claim = await request(app).post('/api/v1/claims').set(headers).send({
      memberId: member.body.id,
      schemeVersionId: version.body.id,
      idempotencyKey: 'pay-once',
    });
    await prisma.claim.update({ where: { id: claim.body.id }, data: { status: 'approved' } });
    const paid = await request(app).post(`/api/v1/claims/${claim.body.id}/pay`).set(headers).send({
      periodId: period.body.id,
      expenseAccountId: expense.id,
      cashAccountId: cash.id,
      amount: '10.0000',
      reason: 'Pay approved claim',
    });
    expect(paid.status).toBe(200);
    const twice = await request(app).post(`/api/v1/claims/${claim.body.id}/pay`).set(headers).send({
      periodId: period.body.id,
      expenseAccountId: expense.id,
      cashAccountId: cash.id,
      amount: '10.0000',
      reason: 'Pay again',
    });
    expect(twice.status).toBe(409);

    const product = await request(app).post('/api/v1/loan-products').set(headers).send({ name: 'Staff loan' });
    const loanVersion = await request(app)
      .post(`/api/v1/loan-products/${product.body.id}/versions`)
      .set(headers)
      .send({ publish: true, ruleBody: { annualRatePercent: '0.0000', termMonths: 12, flatFee: '0.0000' } });
    const application = await request(app)
      .post('/api/v1/loan-applications')
      .set(headers)
      .send({ memberId: member.body.id, productVersionId: loanVersion.body.id });
    const schedule = await request(app)
      .post(`/api/v1/loan-applications/${application.body.id}/schedule`)
      .set(headers)
      .send({ principal: '1200.0000', startOn: '2026-01-31' });
    expect(schedule.status).toBe(201);
    expect(schedule.body.items).toHaveLength(12);
  });
});
