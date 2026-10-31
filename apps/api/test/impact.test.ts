import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { calculateEsg } from '../src/domain/esg';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('esg counting', () => {
  it('counts a beneficiary once and drops an unverified source', () => {
    const result = calculateEsg('beneficiary_count', [
      { id: '11111111-1111-1111-1111-111111111111', verified: true, memberId: 'm1' },
      { id: '22222222-2222-2222-2222-222222222222', verified: true, memberId: 'm1' },
      { id: '33333333-3333-3333-3333-333333333333', verified: false, memberId: 'm2' },
    ]);
    expect(result.verifiedTotal).toBe('1.0000');
    expect(result.unverifiedCount).toBe(1);
    expect(result.sourceIds).toHaveLength(1);
  });
});

describe('emergency and esg api', () => {
  beforeEach(() => resetRateLimits());

  it('submits an emergency with phone only and excludes an unverified ESG source', async () => {
    const society = await prisma.society.create({ data: { name: 'Impact Society' } });
    const user = await prisma.user.create({
      data: { email: 'impact@example.test', displayName: 'Impact', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'impact', name: 'Impact' } });
    for (const code of ['members.write', 'emergency.write', 'emergency.coordinate', 'esg.write', 'esg.read']) {
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
      .send({ memberNo: 'E-1', givenName: 'Nimal', familyName: 'Perera', statusCode: 'applied', categoryCode: 'employee' });
    const first = await request(app).post('/api/v1/emergency-requests').set(headers).send({
      memberId: member.body.id,
      requestType: 'medical',
      phone: '0770000000',
      idempotencyKey: 'emergency-once',
    });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('submitted');
    const duplicate = await request(app).post('/api/v1/emergency-requests').set(headers).send({
      memberId: member.body.id,
      requestType: 'medical',
      phone: '0770000000',
      idempotencyKey: 'emergency-once',
    });
    expect(duplicate.body.id).toBe(first.body.id);
    const closed = await request(app)
      .post(`/api/v1/emergency-requests/${first.body.id}/updates`)
      .set(headers)
      .send({ note: 'Society welfare help arranged', status: 'closed' });
    expect(closed.status).toBe(201);

    const sourceA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sourceB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await request(app).post('/api/v1/verifications').set(headers).send({ objectType: 'member', objectId: sourceA });
    const result = await request(app)
      .post('/api/v1/esg/results')
      .set(headers)
      .send({
        measure: 'beneficiary_count',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        sources: [
          { id: sourceA, memberId: member.body.id },
          { id: sourceB, memberId: member.body.id },
        ],
      });
    expect(result.status).toBe(201);
    expect(result.body.verifiedTotal).toBe('1.0000');
    expect(result.body.unverifiedCount).toBe(1);
    const again = await request(app)
      .post('/api/v1/esg/results')
      .set(headers)
      .send({
        measure: 'beneficiary_count',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        sources: [{ id: sourceA, memberId: member.body.id }],
      });
    expect(again.status).toBe(201);
    expect(await prisma.esgResult.count({ where: { societyId: society.id } })).toBe(2);
  });
});
