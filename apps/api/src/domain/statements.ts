/** Accepted by owner delegation, 31 Oct 2026. Statements read posted lines only. Depreciation is shown only when a useful life is stored, and it is not posted by itself. */

export type StatementAccount = {
  code: string;
  name: string;
  accountType: string;
  isCash: boolean;
  debit: string;
  credit: string;
};

export type StatementLine = { code: string; name: string; amount: string };

export function buildStatements(items: StatementAccount[]) {
  const income = signed(items, 'income');
  const expense = signed(items, 'expense');
  const assets = signed(items, 'asset');
  const liabilities = signed(items, 'liability');
  const equity = signed(items, 'equity');
  const incomeTotal = sum(income);
  const expenseTotal = sum(expense);
  const assetTotal = sum(assets);
  const liabilityTotal = sum(liabilities);
  const equityTotal = sum(equity);
  const surplus = fromMinor(toMinor(incomeTotal) - toMinor(expenseTotal));
  const cash = items
    .filter((item) => item.isCash)
    .map((item) => ({ code: item.code, name: item.name, amount: fromMinor(toMinor(item.debit) - toMinor(item.credit)) }));
  return {
    incomeExpenditure: { income, expense, incomeTotal, expenseTotal, surplus },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      assetTotal,
      liabilityTotal,
      equityTotal,
      balanced: toMinor(assetTotal) === toMinor(liabilityTotal) + toMinor(equityTotal) + toMinor(surplus),
    },
    cashFlow: { lines: cash, net: fromMinor(cash.reduce((total, line) => total + toMinor(line.amount), 0n)) },
  };
}

export function annualDepreciation(cost: string, usefulLifeYears: number | null): string | null {
  if (!usefulLifeYears || usefulLifeYears < 1) return null;
  return fromMinor(toMinor(cost) / BigInt(usefulLifeYears));
}

export function budgetVariance(budget: string, actual: string): string {
  return fromMinor(toMinor(budget) - toMinor(actual));
}

function signed(items: StatementAccount[], type: string): StatementLine[] {
  const naturalCredit = type === 'income' || type === 'liability' || type === 'equity';
  return items
    .filter((item) => item.accountType === type)
    .map((item) => {
      const amount = naturalCredit ? toMinor(item.credit) - toMinor(item.debit) : toMinor(item.debit) - toMinor(item.credit);
      return { code: item.code, name: item.name, amount: fromMinor(amount) };
    })
    .filter((item) => item.amount !== '0.0000');
}

function sum(lines: StatementLine[]): string {
  return fromMinor(lines.reduce((total, line) => total + toMinor(line.amount), 0n));
}

function toMinor(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, frac = ''] = value.replace('-', '').split('.');
  const minor = BigInt(whole || '0') * 10000n + BigInt((frac + '0000').slice(0, 4));
  return negative ? -minor : minor;
}

function fromMinor(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`;
}
