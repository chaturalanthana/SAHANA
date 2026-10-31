/** Accepted by owner delegation, 31 Oct 2026 (OD-01). Societies may add lookup codes. */

export const DEFAULT_MEMBER_STATUSES = [
  'applied',
  'active',
  'suspended',
  'transferred',
  'retired',
  'resigned',
  'terminated',
  'reinstated',
] as const;

export const DEFAULT_MEMBER_CATEGORIES = ['employee'] as const;

export const DEFAULT_RELATIONSHIPS = ['spouse', 'child', 'parent', 'parent_in_law', 'sibling', 'other'] as const;

const transitions: Record<string, readonly string[]> = {
  applied: ['active', 'terminated'],
  active: ['suspended', 'transferred', 'retired', 'resigned', 'terminated'],
  suspended: ['active', 'terminated', 'resigned'],
  transferred: [],
  retired: ['reinstated'],
  resigned: ['reinstated'],
  terminated: [],
  reinstated: ['active'],
};

export function knownCode(code: string, defaults: readonly string[], custom: string[]): boolean {
  return defaults.includes(code) || custom.includes(code);
}

export function memberStatusAllowed(next: string, current: string | null, custom: string[]): boolean {
  if (!knownCode(next, DEFAULT_MEMBER_STATUSES, custom)) return false;
  if (current === null) return next === 'applied' || custom.includes(next);
  if (next === current) return true;
  if (custom.includes(next) || custom.includes(current)) return true;
  return (transitions[current] ?? []).includes(next);
}
