import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PUBLIC_CONFIG_KEYS } from '@sahana/validation';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/modules/auth/passwords';
import { resetRateLimits } from '../src/modules/auth/rate-limit';

const app = createApp();
const password = 'test-password-12';

type Fixture = {
  societyId: string;
  userId: string;
  email: string;
};

async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      consent_acceptances,
      consent_documents,
      config_versions,
      config_definitions,
      audit_events,
      sessions,
      society_user_roles,
      role_permissions,
      roles,
      society_users,
      users,
      societies
    CASCADE
  `);
}

async function seedDefinitions(): Promise<void> {
  const definitions = [
    ['displayName', 'string', 'society', false],
    ['logoFileId', 'string', 'society', false],
    ['contactEmail', 'string', 'society', false],
    ['contactPhone', 'string', 'society', false],
    ['defaultLanguage', 'language', 'society', false],
    ['currencyCode', 'currency', 'society', true],
    ['timezone', 'timezone', 'society', true],
    ['environmentLabel', 'string', 'platform', false],
    ['auth.loginRateLimit', 'number', 'platform', false],
  ] as const;
  for (const [key, valueType, scope, critical] of definitions) {
    await prisma.configDefinition.create({ data: { key, valueType, scope, critical } });
  }
  await prisma.configVersion.create({
    data: {
      definitionKey: 'environmentLabel',
      value: 'test',
      status: 'active',
      reason: 'test',
      createdBy: '00000000-0000-0000-0000-000000000000',
    },
  });
  await prisma.configVersion.create({
    data: {
      definitionKey: 'auth.loginRateLimit',
      value: '10',
      status: 'active',
      reason: 'test',
      createdBy: '00000000-0000-0000-0000-000000000000',
    },
  });
}

async function createMember(input: {
  societyName: string;
  email: string;
  permissions: string[];
  displayName?: string;
}): Promise<Fixture> {
  const society = await prisma.society.create({ data: { name: input.societyName } });
  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName ?? input.email,
      passwordHash: await hashPassword(password),
    },
  });
  const membership = await prisma.societyUser.create({
    data: { societyId: society.id, userId: user.id, createdBy: user.id },
  });
  const role = await prisma.role.create({
    data: { societyId: society.id, code: 'test', name: 'Test' },
  });
  for (const code of input.permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });
  await prisma.configVersion.create({
    data: {
      societyId: society.id,
      definitionKey: 'displayName',
      value: input.societyName,
      status: 'active',
      reason: 'test',
      createdBy: user.id,
    },
  });
  return { societyId: society.id, userId: user.id, email: input.email };
}

async function login(email: string, societyId?: string) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('x-sahana-client', 'web')
    .send({ email, password, client: 'web', societyId });
}

describe('foundation', () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedDefinitions();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns health without society data', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('hides the other society and ignores a swapped society id', async () => {
    const adminA = await createMember({
      societyName: 'Society A',
      email: 'a@example.test',
      permissions: ['config.read', 'config.write', 'users.read', 'audit.read'],
    });
    const adminB = await createMember({
      societyName: 'Society B',
      email: 'b@example.test',
      permissions: ['config.read', 'users.read'],
    });

    const signedIn = await login(adminA.email);
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers['set-cookie']?.[0];
    expect(cookie).toBeTruthy();

    const config = await request(app)
      .get('/api/v1/config?societyId=' + adminB.societyId)
      .set('cookie', cookie ?? '');
    expect(config.status).toBe(200);
    expect(Object.keys(config.body).sort()).toEqual([...PUBLIC_CONFIG_KEYS].sort());
    expect(config.body.displayName).toBe('Society A');
    expect(JSON.stringify(config.body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(config.body)).not.toContain('auth.loginRateLimit');

    const users = await request(app).get('/api/v1/users?pageSize=500').set('cookie', cookie ?? '');
    expect(users.status).toBe(200);
    expect(users.body.pageSize).toBe(100);
    expect(users.body.items.map((item: { email: string }) => item.email)).toEqual([adminA.email]);

    const hidden = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE sahana_app');
      return tx.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM societies`;
    });
    expect(hidden[0]?.count).toBe(0);

    const scoped = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE sahana_app');
      await tx.$executeRaw`SELECT set_config('app.society_id', ${adminA.societyId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${adminA.userId}, true)`;
      return tx.$queryRaw<{ name: string }[]>`SELECT name FROM societies`;
    });
    expect(scoped.map((row) => row.name)).toEqual(['Society A']);
  });

  it('rejects a wrong password and does not store the password', async () => {
    await createMember({
      societyName: 'Society C',
      email: 'c@example.test',
      permissions: ['config.read'],
    });
    const failed = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'c@example.test', password: 'wrong-password', client: 'web' });
    expect(failed.status).toBe(401);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'auth.login_failed' } });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit?.detail)).not.toContain('wrong-password');
    expect(JSON.stringify(audit?.detail).toLowerCase()).not.toContain('password');
  });

  it('requires a second person to approve a critical setting', async () => {
    const editor = await createMember({
      societyName: 'Society D',
      email: 'editor@example.test',
      permissions: ['config.read', 'config.write', 'config.approve'],
    });
    const approverUser = await prisma.user.create({
      data: {
        email: 'approver@example.test',
        displayName: 'Approver',
        passwordHash: await hashPassword(password),
      },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: editor.societyId, userId: approverUser.id, createdBy: approverUser.id },
    });
    const role = await prisma.role.create({
      data: { societyId: editor.societyId, code: 'approver', name: 'Approver' },
    });
    for (const code of ['config.read', 'config.approve']) {
      const permission = await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });

    const editorLogin = await login(editor.email);
    const editorCookie = editorLogin.headers['set-cookie']?.[0] ?? '';
    const missingHeader = await request(app)
      .put('/api/v1/config/currencyCode')
      .set('cookie', editorCookie)
      .send({ value: 'USD', reason: 'Test change' });
    expect(missingHeader.status).toBe(403);
    const submitted = await request(app)
      .put('/api/v1/config/currencyCode')
      .set('cookie', editorCookie)
      .set('x-sahana-client', 'web')
      .send({ value: 'USD', reason: 'Treasury request' });
    expect(submitted.status).toBe(202);

    const self = await request(app)
      .post(`/api/v1/config/changes/${submitted.body.id}/approve`)
      .set('cookie', editorCookie)
      .set('x-sahana-client', 'web');
    expect(self.status).toBe(403);
    expect(self.body.code).toBe('self_approval');

    const approverLogin = await login('approver@example.test');
    const approved = await request(app)
      .post(`/api/v1/config/changes/${submitted.body.id}/approve`)
      .set('cookie', approverLogin.headers['set-cookie']?.[0] ?? '')
      .set('x-sahana-client', 'web');
    expect(approved.status).toBe(204);

    const versions = await prisma.configVersion.findMany({
      where: { societyId: editor.societyId, definitionKey: 'currencyCode' },
    });
    expect(versions.map((row) => row.status).sort()).toEqual(['active', 'pending']);
  });

  it('rejects a setting change without config.write and keeps the previous value', async () => {
    const writer = await createMember({
      societyName: 'Society F',
      email: 'writer@example.test',
      permissions: ['config.read', 'config.write'],
    });
    const reader = await prisma.user.create({
      data: {
        email: 'reader@example.test',
        displayName: 'Reader',
        passwordHash: await hashPassword(password),
      },
    });
    const membership = await prisma.societyUser.create({
      data: { societyId: writer.societyId, userId: reader.id, createdBy: reader.id },
    });
    const role = await prisma.role.create({
      data: { societyId: writer.societyId, code: 'reader', name: 'Reader' },
    });
    const permission = await prisma.permission.upsert({
      where: { code: 'config.read' },
      update: {},
      create: { code: 'config.read', description: 'config.read' },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.societyUserRole.create({ data: { societyUserId: membership.id, roleId: role.id } });
    await prisma.configVersion.create({
      data: {
        societyId: writer.societyId,
        definitionKey: 'contactPhone',
        value: '0111000000',
        status: 'active',
        reason: 'Opening value',
        createdBy: writer.userId,
      },
    });

    const readerLogin = await login(reader.email);
    const denied = await request(app)
      .put('/api/v1/config/contactPhone')
      .set('cookie', readerLogin.headers['set-cookie']?.[0] ?? '')
      .set('x-sahana-client', 'web')
      .send({ value: '0112000000', reason: 'Should fail' });
    expect(denied.status).toBe(403);
    expect(denied.body.messageKey).toBe('config.error.forbidden');

    const writerLogin = await login(writer.email);
    const saved = await request(app)
      .put('/api/v1/config/contactPhone')
      .set('cookie', writerLogin.headers['set-cookie']?.[0] ?? '')
      .set('x-sahana-client', 'web')
      .send({ value: '0112000000', reason: 'New reception number' });
    expect(saved.status).toBe(200);

    const versions = await prisma.configVersion.findMany({
      where: { societyId: writer.societyId, definitionKey: 'contactPhone' },
      orderBy: { createdAt: 'asc' },
    });
    expect(versions.map((row) => row.value)).toEqual(['0111000000', '0112000000']);
    const audit = await prisma.auditEvent.findFirst({
      where: { societyId: writer.societyId, action: 'config.change_submitted' },
    });
    expect(audit?.objectId).toBe(saved.body.id);
    expect(JSON.stringify(audit?.detail)).not.toContain('0112000000');
  });

  it('rotates a mobile refresh token and rejects the old one', async () => {
    await createMember({
      societyName: 'Society E',
      email: 'mobile@example.test',
      permissions: ['config.read'],
    });
    const first = await request(app).post('/api/v1/auth/login').send({
      email: 'mobile@example.test',
      password,
      client: 'mobile',
    });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(refreshed.status).toBe(200);
    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(reused.status).toBe(401);
  });
});
