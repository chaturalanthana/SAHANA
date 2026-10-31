import { useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isLocale } from '@sahana/i18n';
import { SessionProvider, useSession } from './session';
import { Shell } from './shell/Shell';
import { ConfigPage } from './pages/ConfigPage';
import { MemberPage } from './pages/MemberPage';
import { FinancePage } from './pages/FinancePage';
import {
  ApprovalsPage,
  ClaimsPage,
  EmergencyPage,
  EsgPage,
  GovernancePage,
  LoansPage,
  NotificationsPage,
  ProjectsPage,
  SuggestionsPage,
  WelfareSchemesPage,
} from './pages/ModuleScreen';
import { WorkspacePage } from './pages/WorkspacePage';
import { LoginPage } from './pages/LoginPage';
import { useI18n } from './i18n';

function LocaleSync() {
  const session = useSession();
  const { setLocale } = useI18n();
  const synced = useRef<string | null>(null);
  const preferred = session.me?.user.preferredLanguage;
  const societyDefault = session.config?.defaultLanguage;
  useEffect(() => {
    const userId = session.me?.user.id;
    if (!userId || synced.current === userId) return;
    if (preferred && isLocale(preferred)) {
      setLocale(preferred);
      synced.current = userId;
      return;
    }
    if (!session.config) return;
    if (isLocale(societyDefault)) setLocale(societyDefault);
    synced.current = userId;
  }, [preferred, session.config, session.me?.user.id, setLocale, societyDefault]);
  return null;
}

function Protected() {
  const session = useSession();
  const { t } = useI18n();
  if (session.isLoading) {
    return <p className="p-6 text-sm text-body">{t('common.state.loading')}</p>;
  }
  if (!session.me) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <LocaleSync />
      <Routes>
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/members" element={<WorkspacePage sectionKey="members" />} />
        <Route path="/members/:id" element={<MemberPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/governance/:id" element={<GovernancePage />} />
        <Route path="/welfare/claims" element={<ClaimsPage />} />
        <Route path="/welfare/claims/:id" element={<ClaimsPage />} />
        <Route path="/welfare" element={<WelfareSchemesPage />} />
        <Route path="/welfare/:id" element={<WelfareSchemesPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/approvals/:id" element={<ApprovalsPage />} />
        <Route path="/ledger" element={<FinancePage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/loans/:id" element={<LoansPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectsPage />} />
        <Route path="/suggestions" element={<SuggestionsPage />} />
        <Route path="/suggestions/:id" element={<SuggestionsPage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/emergency/:id" element={<EmergencyPage />} />
        <Route path="/esg" element={<EsgPage />} />
        <Route path="/esg/:id" element={<EsgPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notifications/:id" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/config" replace />} />
      </Routes>
    </Shell>
  );
}

function Guest() {
  const session = useSession();
  if (session.me) return <Navigate to="/config" replace />;
  return <LoginPage />;
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Guest />} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
