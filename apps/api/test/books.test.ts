import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { parseStatementCsv } from '../src/domain/statements';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('statement csv', () => {
  it('rejects a file whose header is wrong', () => {
    expect(() => parseStatementCsv('date,amount\n2026-01-01,1')).toThrow(/validation/);
  });
});

describe('period close and disposal', () => {
  beforeEach(() => resetRateLimits());

  it('closes a period, imports a statement, and posts an asset disposal once', async () => {
    const society = await prisma.society.create({ data: { name: 'Books Society' } });
    const user = await prisma.user.create({
      data: { email: 'books@example.test', displayName: 'Books', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'books', name: 'Books' } });
    for (const code of ['ledger.read', 'ledger.post']) {
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
    const income = accounts.body.items.find((item: { code: string }) => item.code === '4100');
    const expense = accounts.body.items.find((item: { code: string }) => item.code === '5000');
    const assetAccount = accounts.body.items.find((item: { code: string }) => item.code === '1300');
    const period = await request(app)
      .post('/api/v1/fiscal-periods')
      .set(headers)
      .send({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const closed = await request(app).post(`/api/v1/fiscal-periods/${period.body.id}/close`).set(headers);
    expect(closed.status).toBe(200);
    const refused = await request(app)
      .post('/api/v1/journal-documents')
      .set(headers)
      .send({ periodId: period.body.id, reason: 'Too late' });
    expect(refused.status).toBe(409);

    const open = await request(app)
      .post('/api/v1/fiscal-periods')
      .set(headers)
      .send({ name: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    const bank = await request(app).post('/api/v1/bank-accounts').set(headers).send({ name: 'Main', accountId: cash.id });
    const bad = await request(app)
      .post(`/api/v1/bank-accounts/${bank.body.id}/statement-import`)
      .set(headers)
      .send({ csv: 'bookedOn,amount\n2026-01-01,1.0000' });
    expect(bad.status).toBe(400);
    const imported = await request(app)
      .post(`/api/v1/bank-accounts/${bank.body.id}/statement-import`)
      .set(headers)
      .send({ csv: 'bookedOn,amount,description\n2026-01-02,10.0000,Deposit\n2026-01-03,-2.5000,Fee' });
    expect(imported.body.created).toBe(2);

    const asset = await request(app)
      .post('/api/v1/assets')
      .set(headers)
      .send({ name: 'Cupboard', cost: '80.0000', acquiredOn: '2026-01-01' });
    const disposed = await request(app)
      .post(`/api/v1/assets/${asset.body.id}/dispose`)
      .set(headers)
      .send({
        periodId: open.body.id,
        cashAccountId: cash.id,
        assetAccountId: assetAccount.id,
        gainAccountId: income.id,
        lossAccountId: expense.id,
        proceeds: '100.0000',
        reason: 'Sold the cupboard',
      });
    expect(disposed.status).toBe(200);
    expect(disposed.body.carrying).toBe('80.0000');
    const again = await request(app)
      .post(`/api/v1/assets/${asset.body.id}/dispose`)
      .set(headers)
      .send({
        periodId: open.body.id,
        cashAccountId: cash.id,
        assetAccountId: assetAccount.id,
        gainAccountId: income.id,
        lossAccountId: expense.id,
        proceeds: '100.0000',
        reason: 'Sold again',
      });
    expect(again.status).toBe(409);
    const document = await prisma.journalDocument.findUnique({ where: { id: disposed.body.journalDocumentId } });
    expect(document?.status).toBe('posted');
  });
});
