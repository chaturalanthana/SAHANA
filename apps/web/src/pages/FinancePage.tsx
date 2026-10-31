import { useQuery } from '@tanstack/react-query';
import { Card, DataTable, KpiCard } from '@sahana/ui-web';
import { useI18n } from '../i18n';
import { client, useSession } from '../session';
import { WorkspacePage } from './WorkspacePage';

type MoneyLine = { code: string; name: string; amount: string };
type Statements = {
  incomeExpenditure: { income: MoneyLine[]; expense: MoneyLine[]; surplus: string };
  balanceSheet: { balanced: boolean; assetTotal: string; liabilityTotal: string; equityTotal: string };
  cashFlow: { net: string; lines: MoneyLine[] };
};

export function FinancePage() {
  const { t } = useI18n();
  const session = useSession();
  const canRead = session.me?.permissions.includes('ledger.read') ?? false;
  const report = useQuery({
    queryKey: ['statements'],
    enabled: canRead,
    queryFn: () => client.request<Statements>('/api/v1/reports/statements'),
  });
  const assets = useQuery({
    queryKey: ['assets'],
    enabled: canRead,
    queryFn: () =>
      client.request<{ items: { id: string; name: string; cost: string; annualDepreciation: string | null }[] }>(
        '/api/v1/assets',
      ),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-heading">{t('modules.finance.statements')}</h1>
      {report.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t('modules.finance.surplus')} value={report.data.incomeExpenditure.surplus} />
            <KpiCard label={t('modules.finance.cashFlow')} value={report.data.cashFlow.net} />
            <KpiCard
              label={t(report.data.balanceSheet.balanced ? 'modules.finance.balanced' : 'modules.finance.unbalanced')}
              value={report.data.balanceSheet.assetTotal}
            />
          </div>
          <Card>
            <h2 className="mb-3 text-base font-semibold text-heading">{t('modules.finance.statements')}</h2>
            <DataTable
              columns={[
                { key: 'code', header: t('modules.field.accountCode') },
                { key: 'name', header: t('modules.field.accountName') },
                { key: 'amount', header: t('modules.finance.surplus') },
              ]}
              rows={[...report.data.incomeExpenditure.income, ...report.data.incomeExpenditure.expense].map((line) => ({
                id: line.code,
                ...line,
              }))}
            />
          </Card>
        </>
      ) : null}
      <Card>
        <h2 className="text-base font-semibold text-heading">{t('modules.finance.asset')}</h2>
        <p className="mt-1 text-sm text-body">{t('modules.finance.depreciation')}</p>
        <p className="mt-2 text-sm text-body">{t('modules.finance.investment')}</p>
        <div className="mt-3">
          <DataTable
            columns={[
              { key: 'name', header: t('modules.field.name') },
              { key: 'cost', header: t('modules.finance.asset') },
              { key: 'annualDepreciation', header: t('modules.finance.depreciation') },
            ]}
            rows={(assets.data?.items ?? []).map((item) => ({
              id: item.id,
              name: item.name,
              cost: item.cost,
              annualDepreciation: item.annualDepreciation ?? '—',
            }))}
          />
        </div>
      </Card>
      <WorkspacePage sectionKey="ledger" />
    </div>
  );
}
