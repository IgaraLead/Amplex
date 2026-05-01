import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/shared/layout/AppLayout';

const Login = React.lazy(() => import('@/modules/auth/Login'));
const OrgSelect = React.lazy(() => import('@/modules/auth/OrgSelect'));
const Dashboard = React.lazy(() => import('@/modules/dashboard/Dashboard'));
const Pipeline = React.lazy(() => import('@/modules/pipeline/Pipeline'));
const Leads = React.lazy(() => import('@/modules/leads/Leads'));
const LeadDetail = React.lazy(() => import('@/modules/leads/LeadDetail'));
const Contacts = React.lazy(() => import('@/modules/contacts/Contacts'));
const Settings = React.lazy(() => import('@/modules/settings/Settings'));
const SuperAdmin = React.lazy(() => import('@/modules/superadmin/SuperAdmin'));

function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={<div className="p-8 text-center text-base-content/50">Carregando...</div>}
    >
      {children}
    </React.Suspense>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RouteSuspense>
            <Login />
          </RouteSuspense>
        }
      />
      <Route
        path="/orgs"
        element={
          <RouteSuspense>
            <OrgSelect />
          </RouteSuspense>
        }
      />
      <Route
        path="/super-admin"
        element={
          <RouteSuspense>
            <SuperAdmin />
          </RouteSuspense>
        }
      />
      <Route path="/id/:slug" element={<AppLayout />}>
        <Route
          path="dashboard"
          element={
            <RouteSuspense>
              <Dashboard />
            </RouteSuspense>
          }
        />
        <Route
          path="pipeline"
          element={
            <RouteSuspense>
              <Pipeline />
            </RouteSuspense>
          }
        />
        <Route
          path="leads"
          element={
            <RouteSuspense>
              <Leads />
            </RouteSuspense>
          }
        />
        <Route
          path="leads/:id"
          element={
            <RouteSuspense>
              <LeadDetail />
            </RouteSuspense>
          }
        />
        <Route
          path="contacts"
          element={
            <RouteSuspense>
              <Contacts />
            </RouteSuspense>
          }
        />
        <Route
          path="settings"
          element={
            <RouteSuspense>
              <Settings />
            </RouteSuspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/orgs" replace />} />
    </Routes>
  );
}
