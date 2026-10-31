import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { translate } from '@sahana/i18n';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';
import { assertBootEnv } from '../src/env';

const app = createApp();
const password = 'test-password-12';

describe('readiness', () => {
  beforeEach(() => resetRateLimits());

  it('falls back to the key when English also lacks it', () => {
    expect(translate('si', 'not.a.real.key')).toBe('not.a.real.key');
    expect(translate('si', 'common.appName')).toBe('SAHANA');
  });

  it('refuses production boot unless MFA is required', () => {
    const nodeEnv = process.env.NODE_ENV;
    const flag = process.env.MFA_REQUIRED;
    process.env.NODE_ENV = 'production';
    delete process.env.MFA_REQUIRED;
    expect(() => assertBootEnv()).toThrow(/MFA_REQUIRED/);
    process.env.NODE_ENV = nodeEnv;
    if (flag === undefined) delete process.env.MFA_REQUIRED;
    else process.env.MFA_REQUIRED = flag;
  });

  it('pages a member list instead of returning every row', async () => {
    const society = await prisma.society.create({ data: { name: 'Capacity Society' } });
    const user = await prisma.user.create({
      data: { email: 'capacity@example.test', displayName: 'Capacity', passwordHash: await hashPassword(password) },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: society.id, userId: user.id, createdBy: user.id },
    });
    const role = await prisma.role.create({ data: { societyId: society.id, code: 'reader', name: 'Reader' } });
    const permission = await prisma.permission.upsert({
      where: { code: 'members.read' },
      update: {},
      create: { code: 'members.read', description: 'members.read' },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });
    await prisma.member.createMany({
      data: Array.from({ length: 40 }, (_, index) => ({
        societyId: society.id,
        memberNo: `C-${index}`,
        givenName: 'Member',
        familyName: String(index),
        statusCode: 'applied',
        categoryCode: 'employee',
        createdBy: user.id,
        updatedBy: user.id,
      })),
    });
    const signedIn = await request(app)
      .post('/api/v1/auth/login')
      .set('x-sahana-client', 'web')
      .send({ email: user.email, password, client: 'web' });
    const page = await request(app)
      .get('/api/v1/members?page=1&pageSize=25')
      .set('cookie', signedIn.headers['set-cookie']?.[0] ?? '')
      .set('x-sahana-client', 'web');
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(25);
    expect(page.body.total).toBe(40);
  });
});
