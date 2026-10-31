import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('projects', () => {
  beforeEach(() => resetRateLimits());

  it('keeps suggestion text when converting and links an expense to a journal', async () => {
    const society = await prisma.society.create({ data: { name: 'Project Society' } });
    const user = await prisma.user.create({
      data: { email: 'projects@example.test', displayName: 'Projects', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'projects', name: 'Projects' } });
    for (const code of ['projects.write', 'projects.read', 'members.write', 'members.read', 'ledger.post', 'ledger.read']) {
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
    const member = await request(app)
      .post('/api/v1/members')
      .set(headers)
      .send({ memberNo: 'P-1', givenName: 'Nimal', familyName: 'Perera', statusCode: 'applied', categoryCode: 'employee' });
    const text = 'Plant trees along the lane';
    const suggestion = await request(app)
      .post('/api/v1/suggestions')
      .set(headers)
      .send({ memberId: member.body.id, body: text });
    const decided = await request(app)
      .post(`/api/v1/suggestions/${suggestion.body.id}/decision`)
      .set(headers)
      .send({ status: 'accepted' });
    expect(decided.status).toBe(200);
    const stored = await prisma.suggestion.findUnique({ where: { id: suggestion.body.id } });
    expect(stored?.body).toBe(text);
    expect(stored?.projectId).toBeTruthy();
    await request(app)
      .post(`/api/v1/projects/${stored?.projectId}/participants`)
      .set(headers)
      .send({ memberId: member.body.id });
    await request(app).post('/api/v1/ledger/chart').set(headers);
    const accounts = await request(app).get('/api/v1/accounts?pageSize=100').set(headers);
    const cash = accounts.body.items.find((item: { code: string }) => item.code === '1000');
    const expense = accounts.body.items.find((item: { code: string }) => item.code === '5100');
    const period = await request(app)
      .post('/api/v1/fiscal-periods')
      .set(headers)
      .send({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const posted = await request(app)
      .post(`/api/v1/projects/${stored?.projectId}/expenses`)
      .set(headers)
      .send({
        description: 'Saplings',
        amount: '15.0000',
        periodId: period.body.id,
        expenseAccountId: expense.id,
        cashAccountId: cash.id,
      });
    expect(posted.status).toBe(201);
    expect(posted.body.journalDocumentId).toBeTruthy();
  });
});
