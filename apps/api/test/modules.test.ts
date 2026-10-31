import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

async function createOfficer(email: string, societyName: string) {
  const society = await prisma.society.create({ data: { name: societyName } });
  const user = await prisma.user.create({
    data: { email, displayName: email, passwordHash: await hashPassword(password) },
  });
  const membership = await prisma.societyUser.create({
    data: { societyId: society.id, userId: user.id, createdBy: user.id },
  });
  const role = await prisma.role.create({ data: { societyId: society.id, code: 'officer', name: 'Officer' } });
  for (const code of ['members.read', 'members.write', 'governance.read', 'governance.write', 'welfare.read', 'welfare.write', 'ledger.read', 'ledger.post', 'esg.read', 'notifications.write']) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });
  return { societyId: society.id, userId: user.id, email };
}

async function login(email: string) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('x-sahana-client', 'web')
    .send({ email, password, client: 'web' });
  return response.headers['set-cookie']?.[0] ?? '';
}

describe('operational modules', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('hides another society member and does not calculate a claim', async () => {
    const alpha = await createOfficer('modules-a@example.test', 'Modules A');
    const beta = await createOfficer('modules-b@example.test', 'Modules B');
    const alphaCookie = await login(alpha.email);
    const created = await request(app)
      .post('/api/v1/members')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({
        memberNo: 'M-1',
        givenName: 'Nimal',
        familyName: 'Perera',
        statusCode: 'applied',
        categoryCode: 'employee',
      });
    expect(created.status).toBe(201);

    const betaCookie = await login(beta.email);
    const hidden = await request(app).get('/api/v1/members').set('cookie', betaCookie).set('x-sahana-client', 'web');
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toEqual([]);
    const hiddenProfile = await request(app)
      .get(`/api/v1/members/${created.body.id}`)
      .set('cookie', betaCookie)
      .set('x-sahana-client', 'web');
    expect(hiddenProfile.status).toBe(404);

    const changed = await request(app)
      .post(`/api/v1/members/${created.body.id}/status`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ statusCode: 'active', reason: 'Later status' });
    expect(changed.status).toBe(201);
    expect(changed.body.statusCode).toBe('active');
    const history = await request(app)
      .get(`/api/v1/members/${created.body.id}/history`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web');
    expect(history.body.items.map((item: { statusCode: string }) => item.statusCode)).toEqual(['applied', 'active']);
    const family = await request(app)
      .post(`/api/v1/members/${created.body.id}/family`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ givenName: 'Kamala', familyName: 'Perera', relationshipCode: 'spouse' });
    expect(family.status).toBe(201);
    const links = await request(app)
      .get(`/api/v1/members/${created.body.id}/family`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web');
    expect(links.body.items).toEqual([
      expect.objectContaining({ givenName: 'Kamala', familyName: 'Perera', relationshipCode: 'spouse' }),
    ]);

    const scheme = await request(app)
      .post('/api/v1/welfare-schemes')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ name: 'Stored scheme' });
    const version = await request(app)
      .post(`/api/v1/welfare-schemes/${scheme.body.id}/versions`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web');
    const claim = await request(app)
      .post('/api/v1/claims')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({
        memberId: created.body.id,
        schemeVersionId: version.body.id,
        idempotencyKey: 'claim-once',
      });
    expect(claim.status).toBe(201);
    expect(claim.body.eligibilityStatus).toBe('not_calculated');
    const again = await request(app)
      .post('/api/v1/claims')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({
        memberId: created.body.id,
        schemeVersionId: version.body.id,
        idempotencyKey: 'claim-once',
      });
    expect(again.body.id).toBe(claim.body.id);

    const usersBefore = await prisma.user.count();
    const familyAgain = await request(app)
      .post(`/api/v1/members/${created.body.id}/family`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ givenName: 'Saman', familyName: 'Perera', relationshipCode: 'not-a-login' });
    expect(familyAgain.status).toBe(422);
    expect(await prisma.user.count()).toBe(usersBefore);

    const blocked = await request(app)
      .post(`/api/v1/members/${created.body.id}/status`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ statusCode: 'reinstated', reason: 'Skip' });
    expect(blocked.status).toBe(422);

    const imported = await request(app)
      .post('/api/v1/members/import')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({
        rows: [
          { memberNo: 'M-2', givenName: 'A', familyName: 'B', statusCode: 'applied', categoryCode: 'employee' },
          { memberNo: 'M-2', givenName: 'C', familyName: 'D', statusCode: 'applied', categoryCode: 'employee' },
        ],
      });
    expect(imported.status).toBe(200);
    expect(imported.body.created).toBe(0);
    expect(imported.body.rejected.length).toBeGreaterThan(0);
    const stillOne = await request(app).get('/api/v1/members').set('cookie', alphaCookie).set('x-sahana-client', 'web');
    expect(stillOne.body.items).toHaveLength(1);

    const committee = await request(app)
      .post('/api/v1/committees')
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ name: 'Welfare committee' });
    const meeting = await request(app)
      .post(`/api/v1/committees/${committee.body.id}/meetings`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ title: 'October meeting', heldOn: '2026-10-31' });
    const resolution = await request(app)
      .post(`/api/v1/meetings/${meeting.body.id}/resolutions`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ title: 'Note the register' });
    expect(resolution.status).toBe(201);
    const appointment = await request(app)
      .post(`/api/v1/committees/${committee.body.id}/appointments`)
      .set('cookie', alphaCookie)
      .set('x-sahana-client', 'web')
      .send({ memberId: created.body.id, roleTitle: 'Secretary', startsOn: '2026-10-01' });
    expect(appointment.status).toBe(201);
  });

  it('posts a balanced journal and refuses an edit or an ESG result', async () => {
    const officer = await createOfficer('ledger@example.test', 'Ledger Society');
    const cookie = await login(officer.email);
    const cash = await request(app)
      .post('/api/v1/accounts')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ code: '1000', name: 'Cash', accountType: 'asset' });
    const income = await request(app)
      .post('/api/v1/accounts')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ code: '4000', name: 'Receipts', accountType: 'income' });
    const period = await request(app)
      .post('/api/v1/fiscal-periods')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const journal = await request(app)
      .post('/api/v1/journal-documents')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ periodId: period.body.id, reason: 'Sample receipt' });
    await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/lines`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ accountId: cash.body.id, debit: '10.0000' });
    const unbalanced = await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/post`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web');
    expect(unbalanced.status).toBe(409);
    expect(unbalanced.body.code).toBe('unbalanced');
    await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/lines`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ accountId: income.body.id, credit: '10.0000' });
    const posted = await request(app)
      .post(`/api/v1/journal-documents/${journal.body.id}/post`)
      .set('cookie', cookie)
      .set('x-sahana-client', 'web');
    expect(posted.status).toBe(200);

    const line = await prisma.journalLine.findFirst({ where: { documentId: journal.body.id } });
    await expect(prisma.$executeRaw`UPDATE journal_lines SET debit = 1 WHERE id = ${line?.id}::uuid`).rejects.toThrow(
      /posted_immutable/,
    );

    const esg = await request(app).post('/api/v1/esg/results').set('cookie', cookie).set('x-sahana-client', 'web').send({});
    expect(esg.status).toBe(409);
    expect(esg.body.code).toBe('not_calculated');

    const whatsapp = await request(app)
      .post('/api/v1/notification-templates')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ code: 'welcome', language: 'en', body: 'Hello', channel: 'whatsapp' });
    expect(whatsapp.status).toBe(400);
    expect(whatsapp.body.code).toBe('channel_disabled');
  });
});
