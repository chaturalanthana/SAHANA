import type { ConfigChange, PublicConfig } from '@sahana/types';
import {
  PUBLIC_CONFIG_KEYS,
  isCriticalConfigKey,
  isPublicConfigKey,
  validateConfigValue,
} from '@sahana/validation';
import { withSociety, type Scope } from '../../db';
import { ApiError } from '../../errors';

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function readPublicConfig(scope: Scope): Promise<PublicConfig> {
  const rows = await withSociety(scope, (tx) =>
    tx.configVersion.findMany({
      where: {
        status: 'active',
        OR: [
          { societyId: scope.societyId, definitionKey: { in: [...PUBLIC_CONFIG_KEYS] } },
          { societyId: null, definitionKey: 'environmentLabel' },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    }),
  );
  const values: Record<string, string> = {};
  for (const row of rows) {
    if (values[row.definitionKey] === undefined) values[row.definitionKey] = asText(row.value);
  }
  return {
    displayName: values.displayName ?? '',
    logoFileId: values.logoFileId ?? '',
    contactEmail: values.contactEmail ?? '',
    contactPhone: values.contactPhone ?? '',
    defaultLanguage: values.defaultLanguage ?? '',
    currencyCode: values.currencyCode ?? '',
    timezone: values.timezone ?? '',
    environmentLabel: values.environmentLabel ?? '',
  };
}

export async function writeConfig(
  scope: Scope,
  key: string,
  value: string,
  reason: string,
  traceId: string,
): Promise<{ id: string; status: 'active' | 'pending' }> {
  if (!isPublicConfigKey(key) || key === 'environmentLabel') {
    throw new ApiError(404, 'not_found', 'errors.notFound');
  }
  const checked = validateConfigValue(key, value);
  if (!checked.ok) {
    throw new ApiError(400, 'validation', 'errors.validation', [{ path: 'value', messageKey: checked.messageKey }]);
  }
  const status = isCriticalConfigKey(key) ? 'pending' : 'active';
  const created = await withSociety(scope, async (tx) => {
    const row = await tx.configVersion.create({
      data: {
        societyId: scope.societyId,
        definitionKey: key,
        value: checked.value,
        status,
        reason,
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'config.change_submitted',
        objectType: 'config_version',
        objectId: row.id,
        traceId,
        detail: { key, status },
      },
    });
    return row;
  });
  return { id: created.id, status };
}

export async function listPendingChanges(scope: Scope): Promise<ConfigChange[]> {
  return withSociety(scope, async (tx) => {
    const pending = await tx.configVersion.findMany({
      where: { societyId: scope.societyId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    const approvals = await tx.configVersion.findMany({
      where: { societyId: scope.societyId, proposalId: { not: null } },
      select: { proposalId: true },
    });
    const done = new Set(approvals.map((row) => row.proposalId));
    const open = pending.filter((row) => !done.has(row.id));
    const actors = await tx.user.findMany({
      where: { id: { in: open.map((row) => row.createdBy) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));
    return open.map((row) => ({
      id: row.id,
      key: row.definitionKey,
      value: asText(row.value),
      reason: row.reason,
      createdBy: row.createdBy,
      createdByDisplayName: names.get(row.createdBy) ?? '',
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

export async function approveChange(scope: Scope, changeId: string, traceId: string): Promise<void> {
  await withSociety(scope, async (tx) => {
    const pending = await tx.configVersion.findFirst({
      where: { id: changeId, societyId: scope.societyId, status: 'pending' },
    });
    if (!pending) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (pending.createdBy === scope.userId) {
      throw new ApiError(403, 'self_approval', 'config.critical.selfApproval');
    }
    const already = await tx.configVersion.findFirst({
      where: { proposalId: pending.id, societyId: scope.societyId },
    });
    if (already) throw new ApiError(409, 'conflict', 'errors.generic');
    const approved = await tx.configVersion.create({
      data: {
        societyId: scope.societyId,
        definitionKey: pending.definitionKey,
        value: pending.value ?? '',
        status: 'active',
        reason: pending.reason,
        proposalId: pending.id,
        createdBy: scope.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        societyId: scope.societyId,
        actorId: scope.userId,
        action: 'config.change_approved',
        objectType: 'config_version',
        objectId: approved.id,
        traceId,
        detail: { key: pending.definitionKey, proposalId: pending.id },
      },
    });
  });
}

export async function listConsent(
  scope: Scope,
): Promise<{ id: string; kind: string; language: string; title: string }[]> {
  return withSociety(scope, (tx) =>
    tx.consentDocument.findMany({
      where: { societyId: scope.societyId },
      select: { id: true, kind: true, language: true, title: true },
      orderBy: { createdAt: 'desc' },
    }),
  );
}
