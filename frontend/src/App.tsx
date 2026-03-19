import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './shared/layout/AppLayout';
import ToastContainer from './shared/ui/Toast';
import ErrorBoundary from './shared/ui/ErrorBoundary';

const Login = React.lazy(() => import('./modules/auth/Login'));
const OrgSelect = React.lazy(() => import('./modules/auth/OrgSelect'));
const Dashboard = React.lazy(() => import('./modules/dashboard/Dashboard'));
const Pipeline = React.lazy(() => import('./modules/pipeline/Pipeline'));
const Leads = React.lazy(() => import('./modules/leads/Leads'));
const LeadDetail = React.lazy(() => import('./modules/leads/LeadDetail'));
const Contacts = React.lazy(() => import('./modules/contacts/Contacts'));
const Settings = React.lazy(() => import('./modules/settings/Settings'));

function Suspense({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Carregando...
        </div>
      }
    >
      {children}
    </React.Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastContainer />
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/orgs"
          element={
            <Suspense>
              <OrgSelect />
            </Suspense>
          }
        />
        <Route path="/o/:orgId" element={<AppLayout />}>
          <Route
            path="dashboard"
            element={
              <Suspense>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="pipeline"
            element={
              <Suspense>
                <Pipeline />
              </Suspense>
            }
          />
          <Route
            path="leads"
            element={
              <Suspense>
                <Leads />
              </Suspense>
            }
          />
          <Route
            path="leads/:id"
            element={
              <Suspense>
                <LeadDetail />
              </Suspense>
            }
          />
          <Route
            path="contacts"
            element={
              <Suspense>
                <Contacts />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense>
                <Settings />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/orgs" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
