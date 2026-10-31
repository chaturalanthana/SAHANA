import { prisma } from './db';
import { hashPassword } from './modules/auth/passwords';

const PERMISSIONS = [
  ['config.read', 'Read society configuration'],
  ['config.write', 'Submit configuration changes'],
  ['config.approve', 'Approve critical configuration changes'],
  ['users.read', 'List users in the society'],
  ['users.invite', 'Invite users'],
  ['audit.read', 'Read the society audit trail'],
  ['members.read', 'Read members and family profiles'],
  ['members.write', 'Record members and family profiles'],
  ['governance.read', 'Read committees and meetings'],
  ['governance.write', 'Record committees and meetings'],
  ['welfare.read', 'Read welfare schemes and claims'],
  ['welfare.write', 'Record welfare schemes and claims'],
  ['approvals.read', 'Read stored approval routes'],
  ['approvals.decide', 'Record an approval decision'],
  ['ledger.read', 'Read the ledger'],
  ['ledger.post', 'Draft and post journals'],
  ['loans.read', 'Read loan records'],
  ['loans.write', 'Record loan applications'],
  ['projects.read', 'Read projects and suggestions'],
  ['projects.write', 'Record projects and suggestions'],
  ['emergency.read', 'Read emergency requests'],
  ['emergency.write', 'Submit an emergency request'],
  ['emergency.coordinate', 'Update an emergency request'],
  ['esg.read', 'Read ESG goals'],
  ['esg.write', 'Record ESG goals'],
  ['notifications.read', 'Read notification templates'],
  ['notifications.write', 'Store an in-app notification template'],
] as const;

const ADMIN_PERMISSIONS = [
  'config.read',
  'config.write',
  'users.read',
  'users.invite',
  'audit.read',
  'members.read',
  'members.write',
  'governance.read',
  'governance.write',
  'welfare.read',
  'welfare.write',
  'approvals.read',
  'ledger.read',
  'ledger.post',
  'loans.read',
  'loans.write',
  'projects.read',
  'projects.write',
  'emergency.read',
  'emergency.write',
  'emergency.coordinate',
  'esg.read',
  'esg.write',
  'notifications.read',
  'notifications.write',
];
const APPROVER_PERMISSIONS = ['config.read', 'config.approve', 'audit.read', 'approvals.read', 'approvals.decide'];
const PLATFORM_PERMISSIONS = [
  'config.read',
  'users.read',
  'audit.read',
  'members.read',
  'governance.read',
  'welfare.read',
  'approvals.read',
  'ledger.read',
  'loans.read',
  'projects.read',
  'emergency.read',
  'esg.read',
  'notifications.read',
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed while NODE_ENV is production');
  }
  if (process.env.SEED_DEMO !== 'true') {
    throw new Error('Set SEED_DEMO=true to seed the local demo societies');
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_DEMO_PASSWORD must be set and at least 12 characters');
  }

  const passwordHash = await hashPassword(password);
  for (const [code, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
  }

  const societyA = await upsertSociety('Demo Society A');
  const societyB = await upsertSociety('Demo Society B');
  await ensureRole(societyA, 'society_admin', 'Society administrator', ADMIN_PERMISSIONS);
  await ensureRole(societyA, 'society_approver', 'Configuration approver', APPROVER_PERMISSIONS);
  await ensureRole(societyA, 'platform_admin', 'Platform administrator', PLATFORM_PERMISSIONS);
  await ensureRole(societyB, 'society_admin', 'Society administrator', ADMIN_PERMISSIONS);

  const adminA = await upsertUser('admin.a@demo.sahana.test', 'Demo Admin A', passwordHash);
  const approverA = await upsertUser('approver.a@demo.sahana.test', 'Demo Approver A', passwordHash);
  const adminB = await upsertUser('admin.b@demo.sahana.test', 'Demo Admin B', passwordHash);
  const platform = await upsertUser('platform.admin@demo.sahana.test', 'Demo Platform Admin', passwordHash);

  await assign(societyA, adminA, 'society_admin');
  await assign(societyA, approverA, 'society_approver');
  await assign(societyA, platform, 'platform_admin');
  await assign(societyB, adminB, 'society_admin');

  await seedDefinitions();
  await seedSocietyConfig(societyA, 'Demo Society A', adminA);
  await seedSocietyConfig(societyB, 'Demo Society B', adminB);
  await seedPlatformConfig(adminA);
  await seedWalkthrough(societyA, adminA);

  console.log('Demo seed completed. Passwords were not printed.');
}

async function seedWalkthrough(societyId: string, actorId: string): Promise<void> {
  const existing = await prisma.member.findFirst({ where: { societyId, memberNo: 'DEMO-001' } });
  if (existing) return;
  const chart = [
    ['1000', 'Cash', 'asset', true],
    ['1100', 'Bank', 'asset', true],
    ['4000', 'Contribution income', 'income', false],
    ['5000', 'Welfare expense', 'expense', false],
  ] as const;
  const accounts: Record<string, string> = {};
  for (const [code, name, accountType, isCash] of chart) {
    const account = await prisma.account.create({
      data: { societyId, code, name, accountType, isCash, createdBy: actorId },
    });
    accounts[code] = account.id;
  }
  const member = await prisma.member.create({
    data: {
      societyId,
      userId: actorId,
      memberNo: 'DEMO-001',
      givenName: 'Nimal',
      familyName: 'Perera',
      statusCode: 'active',
      categoryCode: 'employee',
      createdBy: actorId,
      updatedBy: actorId,
    },
  });
  await prisma.memberStatusHistory.create({
    data: { societyId, memberId: member.id, statusCode: 'applied', reason: 'Application', createdBy: actorId },
  });
  await prisma.memberStatusHistory.create({
    data: { societyId, memberId: member.id, statusCode: 'active', reason: 'Joined', createdBy: actorId },
  });
  const person = await prisma.familyMember.create({
    data: { societyId, givenName: 'Kamala', familyName: 'Perera', createdBy: actorId },
  });
  await prisma.memberFamilyLink.create({
    data: { societyId, memberId: member.id, familyMemberId: person.id, relationshipCode: 'spouse', createdBy: actorId },
  });
  const period = await prisma.fiscalPeriod.create({
    data: {
      societyId,
      name: '2026',
      startsOn: new Date('2026-01-01'),
      endsOn: new Date('2026-12-31'),
      createdBy: actorId,
    },
  });
  const fund = await prisma.fund.create({ data: { societyId, name: 'Welfare fund', createdBy: actorId } });
  const journal = await prisma.journalDocument.create({
    data: { societyId, periodId: period.id, status: 'posted', reason: 'Opening contribution', createdBy: actorId, postedAt: new Date(), postedBy: actorId },
  });
  await prisma.journalLine.create({
    data: { societyId, documentId: journal.id, accountId: accounts['1000']!, fundId: fund.id, memberId: member.id, debit: '25.0000', credit: '0' },
  });
  await prisma.journalLine.create({
    data: { societyId, documentId: journal.id, accountId: accounts['4000']!, fundId: fund.id, debit: '0', credit: '25.0000' },
  });
  const committee = await prisma.committee.create({ data: { societyId, name: 'Welfare committee', createdBy: actorId } });
  const meeting = await prisma.meeting.create({
    data: { societyId, committeeId: committee.id, title: 'October meeting', heldOn: new Date('2026-10-31'), createdBy: actorId },
  });
  await prisma.resolution.create({ data: { societyId, meetingId: meeting.id, title: 'Note the register', createdBy: actorId } });
  await prisma.committeeAppointment.create({
    data: { societyId, committeeId: committee.id, memberId: member.id, roleTitle: 'Secretary', startsOn: new Date('2026-01-01'), createdBy: actorId },
  });
  const scheme = await prisma.welfareScheme.create({ data: { societyId, name: 'Medical assistance', createdBy: actorId } });
  const version = await prisma.welfareSchemeVersion.create({
    data: {
      societyId,
      schemeId: scheme.id,
      versionNo: 1,
      publishedAt: new Date(),
      ruleBody: {
        waitingDays: 0,
        maxAmount: null,
        coveredRelationships: ['spouse', 'child'],
        memberStatuses: ['active'],
        frequency: 'once',
        requiredDocuments: [],
        contributionRequired: false,
      },
      createdBy: actorId,
    },
  });
  await prisma.claim.create({
    data: {
      societyId,
      memberId: member.id,
      schemeVersionId: version.id,
      idempotencyKey: 'demo-claim',
      eligibilityStatus: 'eligible',
      eligibilityReason: 'rule',
      status: 'submitted',
      createdBy: actorId,
    },
  });
  const product = await prisma.loanProduct.create({ data: { societyId, name: 'Staff loan', createdBy: actorId } });
  const loanVersion = await prisma.loanProductVersion.create({
    data: {
      societyId,
      productId: product.id,
      versionNo: 1,
      publishedAt: new Date(),
      ruleBody: { annualRatePercent: '0.0000', termMonths: 12, flatFee: '0.0000' },
      createdBy: actorId,
    },
  });
  await prisma.loanApplication.create({
    data: { societyId, memberId: member.id, productVersionId: loanVersion.id, createdBy: actorId },
  });
  const project = await prisma.project.create({
    data: { societyId, name: 'Tree planting', category: 'suggestion', createdBy: actorId },
  });
  await prisma.projectParticipant.create({ data: { societyId, projectId: project.id, memberId: member.id } });
  await prisma.suggestion.create({
    data: { societyId, memberId: member.id, body: 'Plant trees along the lane', status: 'accepted', projectId: project.id, createdBy: actorId },
  });
  await prisma.emergencyRequest.create({
    data: {
      societyId,
      memberId: member.id,
      requestType: 'medical',
      phone: '0770000000',
      description: '',
      idempotencyKey: 'demo-emergency',
      status: 'submitted',
      createdBy: actorId,
    },
  });
  await prisma.esgGoal.create({ data: { societyId, name: 'Member participation', createdBy: actorId } });
  await prisma.notificationTemplate.create({
    data: { societyId, code: 'claim.submitted', language: 'en', channel: 'in_app', body: 'Your claim was stored.', createdBy: actorId },
  });
  const bank = await prisma.bankAccount.create({
    data: { societyId, name: 'Main bank', accountId: accounts['1000']!, createdBy: actorId },
  });
  await prisma.bankStatementLine.create({
    data: { societyId, bankAccountId: bank.id, bookedOn: new Date('2026-02-01'), amount: '25.0000', description: 'Contribution', createdBy: actorId },
  });
  await prisma.budget.create({
    data: { societyId, name: 'Welfare spend', accountId: accounts['5000']!, periodId: period.id, amount: '100.0000', createdBy: actorId },
  });
  await prisma.fixedAsset.create({
    data: { societyId, name: 'Cupboard', cost: '80.0000', acquiredOn: new Date('2026-01-01'), createdBy: actorId },
  });
  await prisma.approvalRoute.create({
    data: { societyId, name: 'Claim approval', policyStatus: 'in_force', allowSelfApproval: false, createdBy: actorId },
  });
}

async function upsertSociety(name: string): Promise<string> {
  const existing = await prisma.society.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.society.create({
    data: { name, defaultLanguage: 'en', currencyCode: 'LKR', timezone: 'Asia/Colombo' },
  });
  return created.id;
}

async function upsertUser(email: string, displayName: string, passwordHash: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName, passwordHash, status: 'active' },
    create: { email, displayName, passwordHash, status: 'active' },
  });
  return user.id;
}

async function ensureRole(
  societyId: string,
  code: string,
  name: string,
  permissionCodes: string[],
): Promise<void> {
  const role = await prisma.role.upsert({
    where: { societyId_code: { societyId, code } },
    update: { name },
    create: { societyId, code, name },
  });
  const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function assign(societyId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.societyUser.upsert({
    where: { societyId_userId: { societyId, userId } },
    update: { status: 'active' },
    create: { societyId, userId, status: 'active', createdBy: userId },
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: { societyId_code: { societyId, code: roleCode } },
  });
  await prisma.societyUserRole.upsert({
    where: { societyUserId_roleId: { societyUserId: membership.id, roleId: role.id } },
    update: {},
    create: { societyUserId: membership.id, roleId: role.id },
  });
}

async function seedDefinitions(): Promise<void> {
  const definitions = [
    { key: 'displayName', valueType: 'string', scope: 'society', critical: false },
    { key: 'logoFileId', valueType: 'string', scope: 'society', critical: false },
    { key: 'contactEmail', valueType: 'string', scope: 'society', critical: false },
    { key: 'contactPhone', valueType: 'string', scope: 'society', critical: false },
    { key: 'defaultLanguage', valueType: 'language', scope: 'society', critical: false },
    { key: 'currencyCode', valueType: 'currency', scope: 'society', critical: true },
    { key: 'timezone', valueType: 'timezone', scope: 'society', critical: true },
    { key: 'environmentLabel', valueType: 'string', scope: 'platform', critical: false },
    { key: 'auth.loginRateLimit', valueType: 'number', scope: 'platform', critical: false },
  ];
  for (const definition of definitions) {
    await prisma.configDefinition.upsert({
      where: { key: definition.key },
      update: definition,
      create: definition,
    });
  }
}

async function seedSocietyConfig(societyId: string, displayName: string, actorId: string): Promise<void> {
  const values: Record<string, string> = {
    displayName,
    logoFileId: '',
    contactEmail: '',
    contactPhone: '',
    defaultLanguage: 'en',
    currencyCode: 'LKR',
    timezone: 'Asia/Colombo',
  };
  for (const [key, value] of Object.entries(values)) {
    const existing = await prisma.configVersion.findFirst({
      where: { societyId, definitionKey: key, status: 'active' },
    });
    if (existing) continue;
    await prisma.configVersion.create({
      data: {
        societyId,
        definitionKey: key,
        value,
        status: 'active',
        reason: 'Demo seed',
        createdBy: actorId,
      },
    });
  }
}

async function seedPlatformConfig(actorId: string): Promise<void> {
  const values: Record<string, string> = {
    environmentLabel: 'local',
    'auth.loginRateLimit': '10',
  };
  for (const [key, value] of Object.entries(values)) {
    const existing = await prisma.configVersion.findFirst({
      where: { societyId: null, definitionKey: key, status: 'active' },
    });
    if (existing) continue;
    await prisma.configVersion.create({
      data: {
        definitionKey: key,
        value,
        status: 'active',
        reason: 'Demo seed',
        createdBy: actorId,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'seed failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
