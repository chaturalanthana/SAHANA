import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { Shell } from './shell/Shell';
import { ConfigPage } from './pages/ConfigPage';
import { MemberPage } from './pages/MemberPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { LoginPage } from './pages/LoginPage';
import { useI18n } from './i18n';

function Protected() {
  const session = useSession();
  const { t } = useI18n();
  if (session.isLoading) {
    return <p className="p-6 text-sm text-muted">{t('common.state.loading')}</p>;
  }
  if (!session.me) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <Routes>
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/members" element={<WorkspacePage sectionKey="members" />} />
        <Route path="/members/:id" element={<MemberPage />} />
        <Route path="/governance" element={<WorkspacePage sectionKey="governance" />} />
        <Route path="/welfare" element={<WorkspacePage sectionKey="welfare" />} />
        <Route path="/ledger" element={<WorkspacePage sectionKey="ledger" />} />
        <Route path="/loans" element={<WorkspacePage sectionKey="loans" />} />
        <Route path="/projects" element={<WorkspacePage sectionKey="projects" />} />
        <Route path="/emergency" element={<WorkspacePage sectionKey="emergency" />} />
        <Route path="/esg" element={<WorkspacePage sectionKey="esg" />} />
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
