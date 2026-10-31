import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';
import { totpCode, verifyTotp, generateTotpSecret } from '../src/modules/auth/totp';

const app = createApp();
const password = 'test-password-12';

describe('totp', () => {
  it('accepts the current code and rejects a wrong one', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, totpCode(secret))).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
});

describe('identity hook', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('stores a preferred language and a confirmed totp factor without auditing the secret', async () => {
    const society = await prisma.society.create({ data: { name: 'Identity Society', defaultLanguage: 'si' } });
    const user = await prisma.user.create({
      data: {
        email: 'identity@example.test',
        displayName: 'Identity User',
        passwordHash: await hashPassword(password),
      },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({
      data: { societyId: society.id, code: 'reader', name: 'Reader' },
    });
    const permission = await prisma.permission.upsert({
      where: { code: 'config.read' },
      update: {},
      create: { code: 'config.read', description: 'config.read' },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });

    const signedIn = await request(app)
      .post('/api/v1/auth/login')
      .set('x-sahana-client', 'web')
      .send({ email: user.email, password, client: 'web' });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers['set-cookie']?.[0] ?? '';

    const language = await request(app)
      .post('/api/v1/me/language')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ language: 'ta' });
    expect(language.status).toBe(204);
    const me = await request(app).get('/api/v1/me').set('cookie', cookie);
    expect(me.body.user.preferredLanguage).toBe('ta');

    const enrolled = await request(app)
      .post('/api/v1/me/mfa/enroll')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web');
    expect(enrolled.status).toBe(201);
    const secret = new URL(enrolled.body.otpauthUri).searchParams.get('secret');
    expect(secret).toBeTruthy();
    const wrong = await request(app)
      .post('/api/v1/me/mfa/confirm')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ code: '000000' });
    expect(wrong.status).toBe(400);
    const confirmed = await request(app)
      .post('/api/v1/me/mfa/confirm')
      .set('cookie', cookie)
      .set('x-sahana-client', 'web')
      .send({ code: totpCode(secret ?? '') });
    expect(confirmed.status).toBe(204);

    const audits = await prisma.auditEvent.findMany({
      where: { societyId: society.id, action: { in: ['auth.mfa_enroll_started', 'auth.mfa_confirmed'] } },
    });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(secret);
  });
});
