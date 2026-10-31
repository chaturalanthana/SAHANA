/** Accepted by owner delegation, 31 Oct 2026 (OD-05). No carbon factor. Unverified rows are excluded from the verified total. */

export type EsgMeasure = 'participation_count' | 'volunteer_hours' | 'beneficiary_count' | 'project_spend';

export type EsgSource = {
  id: string;
  verified: boolean;
  memberId?: string | null;
  familyMemberId?: string | null;
  hours?: string | null;
  amount?: string | null;
  journalDocumentId?: string | null;
};

export function calculateEsg(measure: EsgMeasure, sources: EsgSource[]): {
  verifiedTotal: string;
  unverifiedCount: number;
  sourceIds: string[];
} {
  const seen = new Set<string>();
  let total = 0n;
  const sourceIds: string[] = [];
  let unverifiedCount = 0;
  for (const source of sources) {
    if (!source.verified) {
      unverifiedCount += 1;
      continue;
    }
    const key =
      measure === 'project_spend'
        ? source.journalDocumentId ?? source.id
        : measure === 'beneficiary_count'
          ? source.familyMemberId
            ? `family:${source.familyMemberId}`
            : `member:${source.memberId ?? source.id}`
          : source.memberId
            ? `member:${source.memberId}`
            : source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    sourceIds.push(source.id);
    if (measure === 'participation_count' || measure === 'beneficiary_count') total += 10000n;
    else if (measure === 'volunteer_hours') total += toMinor(source.hours ?? '0');
    else total += toMinor(source.amount ?? '0');
  }
  return { verifiedTotal: fromMinor(total), unverifiedCount, sourceIds };
}

function toMinor(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * 10000n + BigInt((frac + '0000').slice(0, 4));
}

function fromMinor(value: bigint): string {
  const whole = value / 10000n;
  const frac = (value % 10000n).toString().padStart(4, '0');
  return `${whole.toString()}.${frac}`;
}
