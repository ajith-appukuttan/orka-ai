import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { IntakePage } from './pages/IntakePage';
import { ReviewPage } from './pages/ReviewPage';

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<IntakePage />} />
          <Route path="/review/:workspaceId/:sessionId" element={<ReviewPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
