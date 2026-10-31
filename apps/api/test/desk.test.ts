import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';
import { sweepEmergencyDeadlines } from '../src/modules/operations/operations.service';

const app = createApp();
const password = 'test-password-12';

async function signIn(email: string, codes: string[]) {
  const society = await prisma.society.create({ data: { name: email } });
  const user = await prisma.user.create({
    data: { email, displayName: email, passwordHash: await hashPassword(password) },
  });
  const membership = await prisma.societyUser.create({
    data: { societyId: society.id, userId: user.id, createdBy: user.id },
  });
  const role = await prisma.role.create({ data: { societyId: society.id, code: 'desk', name: 'Desk' } });
  for (const code of codes) {
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
    .send({ email, password, client: 'web' });
  return {
    societyId: society.id,
    userId: user.id,
    headers: { cookie: signedIn.headers['set-cookie']?.[0] ?? '', 'x-sahana-client': 'web' },
  };
}

describe('detail edits, settlement quote, and emergency deadlines', () => {
  beforeEach(() => resetRateLimits());

  it('renames a scheme, refuses evidence on a paid claim, and quotes a zero-rate settlement', async () => {
    const { headers } = await signIn('desk-quote@example.test', [
      'welfare.read',
      'welfare.write',
      'loans.read',
      'loans.write',
      'members.write',
      'ledger.post',
    ]);
    const scheme = await request(app).post('/api/v1/welfare-schemes').set(headers).send({ name: 'Aid' });
    const renamed = await request(app).put(`/api/v1/records/welfareScheme/${scheme.body.id}`).set(headers).send({ name: 'Medical aid' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Medical aid');

    const member = await request(app).post('/api/v1/members').set(headers).send({
      memberNo: 'D-1',
      givenName: 'Nimal',
      familyName: 'Perera',
      statusCode: 'applied',
      categoryCode: 'employee',
    });
    const version = await request(app).post(`/api/v1/welfare-schemes/${scheme.body.id}/versions`).set(headers).send({});
    const claim = await request(app).post('/api/v1/claims').set(headers).send({
      memberId: member.body.id,
      schemeVersionId: version.body.id,
      idempotencyKey: 'desk-claim',
    });
    await prisma.claim.update({ where: { id: claim.body.id }, data: { status: 'paid' } });
    const evidence = await request(app)
      .put(`/api/v1/records/claim/${claim.body.id}`)
      .set(headers)
      .send({ evidenceNote: 'Too late' });
    expect(evidence.status).toBe(409);

    const product = await request(app).post('/api/v1/loan-products').set(headers).send({ name: 'Staff' });
    const loanVersion = await request(app).post(`/api/v1/loan-products/${product.body.id}/versions`).set(headers).send({
      publish: true,
      ruleBody: { annualRatePercent: '0.0000', termMonths: 12, flatFee: '0.0000' },
    });
    const application = await request(app).post('/api/v1/loan-applications').set(headers).send({
      memberId: member.body.id,
      productVersionId: loanVersion.body.id,
    });
    const schedule = await request(app).post(`/api/v1/loan-applications/${application.body.id}/schedule`).set(headers).send({
      principal: '1200.0000',
      startOn: '2026-03-01',
    });
    expect(schedule.status).toBe(201);
    const quote = await request(app).post(`/api/v1/loan-applications/${application.body.id}/settlement`).set(headers).send({ days: 10 });
    expect(quote.status).toBe(200);
    expect(quote.body.amount).toBe('1200.0000');
    expect(quote.body.days).toBe(10);
  });

  it('sends one in-app notice at 4 hours and another at 8 hours, and skips a closed request', async () => {
    const first = await signIn('desk-emergency@example.test', ['members.write', 'emergency.write', 'emergency.read']);
    const member = await request(app).post('/api/v1/members').set(first.headers).send({
      memberNo: 'D-2',
      givenName: 'Kamala',
      familyName: 'Perera',
      statusCode: 'applied',
      categoryCode: 'employee',
    });
    expect(member.status).toBe(201);
    const open = await request(app).post('/api/v1/emergency-requests').set(first.headers).send({
      memberId: member.body.id,
      requestType: 'medical',
      phone: '0770000001',
      idempotencyKey: 'desk-open',
    });
    const closed = await request(app).post('/api/v1/emergency-requests').set(first.headers).send({
      memberId: member.body.id,
      requestType: 'medical',
      phone: '0770000002',
      idempotencyKey: 'desk-closed',
    });
    await prisma.emergencyRequest.update({
      where: { id: open.body.id },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    await prisma.emergencyRequest.update({
      where: { id: closed.body.id },
      data: { status: 'closed', createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
    });
    const other = await signIn('desk-other@example.test', ['members.write', 'emergency.write']);
    const otherMember = await request(app).post('/api/v1/members').set(other.headers).send({
      memberNo: 'D-3',
      givenName: 'Sita',
      familyName: 'Fernando',
      statusCode: 'applied',
      categoryCode: 'employee',
    });
    expect(otherMember.status).toBe(201);
    const recent = await request(app).post('/api/v1/emergency-requests').set(other.headers).send({
      memberId: otherMember.body.id,
      requestType: 'medical',
      phone: '0770000003',
      idempotencyKey: 'desk-recent',
    });

    await sweepEmergencyDeadlines(new Date());
    await sweepEmergencyDeadlines(new Date());
    const ack = await prisma.notificationDelivery.findMany({ where: { objectId: open.body.id } });
    expect(ack.map((item) => item.messageKey)).toEqual(['modules.emergency.acknowledgeDue']);
    expect(ack[0]?.channel).toBe('in_app');
    expect(ack[0]?.societyId).toBe(first.societyId);
    expect(await prisma.notificationDelivery.count({ where: { objectId: closed.body.id } })).toBe(0);
    expect(await prisma.notificationDelivery.count({ where: { objectId: recent.body.id } })).toBe(0);

    await prisma.emergencyRequest.update({
      where: { id: open.body.id },
      data: { createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
    });
    await sweepEmergencyDeadlines(new Date());
    const both = await prisma.notificationDelivery.findMany({
      where: { objectId: open.body.id },
      orderBy: { messageKey: 'asc' },
    });
    expect(both.map((item) => item.messageKey)).toEqual([
      'modules.emergency.acknowledgeDue',
      'modules.emergency.escalateDue',
    ]);
  });
});
