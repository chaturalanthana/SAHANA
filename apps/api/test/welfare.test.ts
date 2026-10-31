import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { evaluateWelfare, DEFAULT_WELFARE_RULE } from '../src/domain/welfare';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

describe('welfare rule', () => {
  it('does not treat a missing status list as eligible', () => {
    const result = evaluateWelfare({
      rule: DEFAULT_WELFARE_RULE,
      memberStatus: 'applied',
      memberSince: new Date('2026-01-01'),
      asOf: new Date('2026-02-01'),
      relationship: null,
      amount: null,
      documents: [],
      priorClaims: 0,
      contributionSatisfied: true,
    });
    expect(result).toEqual({ status: 'ineligible', reason: 'status' });
  });
});

describe('published claims', () => {
  beforeEach(() => resetRateLimits());

  it('keeps the stored eligibility when the rule version changes and rejects self-approval', async () => {
    const society = await prisma.society.create({ data: { name: 'Welfare Society' } });
    const user = await prisma.user.create({
      data: { email: 'welfare@example.test', displayName: 'Welfare', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'officer', name: 'Officer' } });
    for (const code of ['members.write', 'members.read', 'welfare.write', 'welfare.read', 'approvals.read', 'approvals.decide']) {
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
    const member = await request(app)
      .post('/api/v1/members')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ memberNo: 'W-1', givenName: 'Nimal', familyName: 'Perera', statusCode: 'applied', categoryCode: 'employee' });
    await request(app)
      .post(`/api/v1/members/${member.body.id}/status`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ statusCode: 'active', reason: 'Joined' });
    const scheme = await request(app)
      .post('/api/v1/welfare-schemes')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ name: 'Medical' });
    const version = await request(app)
      .post(`/api/v1/welfare-schemes/${scheme.body.id}/versions`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ publish: true });
    const claim = await request(app)
      .post('/api/v1/claims')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ memberId: member.body.id, schemeVersionId: version.body.id, idempotencyKey: 'once', evidenceNote: 'bill' });
    expect(claim.status).toBe(201);
    expect(claim.body.eligibilityStatus).toBe('eligible');
    expect(claim.body.schemeVersionId).toBe(version.body.id);
    const again = await request(app)
      .post('/api/v1/claims')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ memberId: member.body.id, schemeVersionId: version.body.id, idempotencyKey: 'twice' });
    expect(again.body.eligibilityStatus).toBe('ineligible');
    expect(again.body.eligibilityReason).toBe('frequency');
    const replacement = await request(app)
      .post(`/api/v1/welfare-schemes/${scheme.body.id}/versions`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ publish: true, ruleBody: { ...DEFAULT_WELFARE_RULE, memberStatuses: ['suspended'] } });
    expect(replacement.status).toBe(201);
    const history = await request(app).get(`/api/v1/claims/${claim.body.id}`).set('cookie', cookie).set('x-sahana-client', 'web');
    expect(history.body.claim.eligibilityStatus).toBe('eligible');
    expect(history.body.claim.schemeVersionId).toBe(version.body.id);
    expect(history.body.events).toHaveLength(1);
    const route = await request(app)
      .post('/api/v1/approval-routes')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ name: 'Claim route' });
    expect(route.status).toBe(201);
    expect(route.body.policyStatus).toBe('in_force');
    const approval = await request(app)
      .post('/api/v1/approval-requests')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ objectType: 'claim', objectId: claim.body.id, routeId: route.body.id });
    const self = await request(app)
      .post(`/api/v1/approval-requests/${approval.body.id}/decisions`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ stageNo: 1, decision: 'approve', reason: 'Own claim' });
    expect(self.status).toBe(403);
    expect(self.body.code).toBe('self_approval');
    const notices = await prisma.notificationDelivery.count({ where: { societyId: society.id, channel: 'in_app' } });
    expect(notices).toBeGreaterThan(0);
  });
});
