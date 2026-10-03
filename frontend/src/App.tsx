import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { SessionPage } from './pages/SessionPage';
import { TooltipProvider } from './components/ui/tooltip';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/session/:sessionId" element={<SessionPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </TooltipProvider>
    </BrowserRouter>
  );
};
