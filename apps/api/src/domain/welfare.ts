/** Accepted by owner delegation, 31 Oct 2026 (OD-02). Empty or unpublished rules are not eligible. */

export type WelfareRule = {
  waitingDays: number;
  maxAmount: string | null;
  coveredRelationships: string[];
  memberStatuses: string[];
  frequency: 'once' | 'monthly' | 'yearly';
  requiredDocuments: string[];
  contributionRequired: boolean;
};

export const DEFAULT_WELFARE_RULE: WelfareRule = {
  waitingDays: 0,
  maxAmount: null,
  coveredRelationships: ['spouse', 'child', 'parent', 'parent_in_law'],
  memberStatuses: ['active'],
  frequency: 'once',
  requiredDocuments: [],
  contributionRequired: false,
};

export function parseWelfareRule(body: unknown): WelfareRule | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.memberStatuses)) return null;
  const frequency = record.frequency === 'monthly' || record.frequency === 'yearly' ? record.frequency : 'once';
  return {
    waitingDays: typeof record.waitingDays === 'number' && record.waitingDays >= 0 ? record.waitingDays : 0,
    maxAmount: typeof record.maxAmount === 'string' ? record.maxAmount : null,
    coveredRelationships: strings(record.coveredRelationships),
    memberStatuses: strings(record.memberStatuses),
    frequency,
    requiredDocuments: strings(record.requiredDocuments),
    contributionRequired: record.contributionRequired === true,
  };
}

export function evaluateWelfare(input: {
  rule: WelfareRule;
  memberStatus: string;
  memberSince: Date;
  asOf: Date;
  relationship: string | null;
  amount: string | null;
  documents: string[];
  priorClaims: number;
  contributionSatisfied: boolean;
}): { status: 'eligible' | 'ineligible'; reason: string } {
  if (!input.rule.memberStatuses.includes(input.memberStatus)) return { status: 'ineligible', reason: 'status' };
  if (input.relationship && !input.rule.coveredRelationships.includes(input.relationship)) {
    return { status: 'ineligible', reason: 'relationship' };
  }
  const waitedMs = input.asOf.getTime() - input.memberSince.getTime();
  if (waitedMs < input.rule.waitingDays * 86_400_000) return { status: 'ineligible', reason: 'waiting' };
  if (input.rule.maxAmount && input.amount && compareMoney(input.amount, input.rule.maxAmount) > 0) {
    return { status: 'ineligible', reason: 'limit' };
  }
  if (input.rule.requiredDocuments.some((document) => !input.documents.includes(document))) {
    return { status: 'ineligible', reason: 'evidence' };
  }
  if (input.rule.contributionRequired && !input.contributionSatisfied) {
    return { status: 'ineligible', reason: 'contribution' };
  }
  if (input.priorClaims > 0) return { status: 'ineligible', reason: 'frequency' };
  return { status: 'eligible', reason: 'rule' };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function compareMoney(left: string, right: string): number {
  const a = toMinor(left);
  const b = toMinor(right);
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function toMinor(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, frac = ''] = value.replace('-', '').split('.');
  const minor = BigInt(whole || '0') * 10000n + BigInt((frac + '0000').slice(0, 4));
  return negative ? -minor : minor;
}
