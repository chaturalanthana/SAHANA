/** Accepted by owner delegation, 31 Oct 2026 (OD-03, TD-06). Simple interest, Actual/365, half-up to 4 decimal places. Zero rate until the society sets one. */

export type LoanRule = {
  annualRatePercent: string;
  termMonths: number;
  flatFee: string;
};

export const DEFAULT_LOAN_RULE: LoanRule = {
  annualRatePercent: '0.0000',
  termMonths: 12,
  flatFee: '0.0000',
};

export type ScheduleLine = {
  installmentNo: number;
  dueOn: string;
  principal: string;
  interest: string;
  fee: string;
};

export function parseLoanRule(body: unknown): LoanRule | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.termMonths !== 'number' || record.termMonths < 1 || record.termMonths > 360) return null;
  return {
    annualRatePercent: typeof record.annualRatePercent === 'string' ? record.annualRatePercent : '0.0000',
    termMonths: record.termMonths,
    flatFee: typeof record.flatFee === 'string' ? record.flatFee : '0.0000',
  };
}

export function buildSchedule(principal: string, rule: LoanRule, start: Date): ScheduleLine[] {
  const principalMinor = toMinor(principal);
  const rateMinor = toMinor(rule.annualRatePercent);
  const feeMinor = toMinor(rule.flatFee);
  const totalInterest = (principalMinor * rateMinor * BigInt(rule.termMonths)) / (10000n * 12n * 10000n);
  const basePrincipal = principalMinor / BigInt(rule.termMonths);
  const baseInterest = totalInterest / BigInt(rule.termMonths);
  let principalUsed = 0n;
  let interestUsed = 0n;
  const lines: ScheduleLine[] = [];
  for (let index = 1; index <= rule.termMonths; index += 1) {
    const last = index === rule.termMonths;
    const principalPart = last ? principalMinor - principalUsed : basePrincipal;
    const interestPart = last ? totalInterest - interestUsed : baseInterest;
    principalUsed += principalPart;
    interestUsed += interestPart;
    const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, start.getUTCDate()));
    lines.push({
      installmentNo: index,
      dueOn: due.toISOString().slice(0, 10),
      principal: fromMinor(principalPart),
      interest: fromMinor(interestPart),
      fee: index === 1 ? fromMinor(feeMinor) : '0.0000',
    });
  }
  return lines;
}

export function settlementAmount(input: { remainingPrincipal: string; annualRatePercent: string; days: number; unpaidFee: string }): string {
  const principal = toMinor(input.remainingPrincipal);
  const rate = toMinor(input.annualRatePercent);
  const accrued = (principal * rate * BigInt(Math.max(0, input.days))) / (10000n * 365n * 10000n);
  return fromMinor(principal + accrued + toMinor(input.unpaidFee));
}

function toMinor(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * 10000n + BigInt((frac + '0000').slice(0, 4));
}

function fromMinor(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10000n;
  const frac = (absolute % 10000n).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}
