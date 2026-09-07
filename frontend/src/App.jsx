import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { useAuth } from './store/auth'

const AccessDeniedPage = lazy(() => import('./pages/AccessDeniedPage'))
const AuditPage = lazy(() => import('./pages/AuditPage'))
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const FinesPage = lazy(() => import('./pages/FinesPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const LoansPage = lazy(() => import('./pages/LoansPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

function ProtectedLayout() {
  const user = useAuth((state) => state.user)
  return user ? <AppShell /> : <Navigate to="/login" replace />
}

function PermissionPage({ any, children }) {
  const permissions = useAuth((state) => state.permissions)
  return any.some((permission) => permissions.includes(permission)) ? children : <Navigate to="/forbidden" replace />
}

export default function App() {
  const initialize = useAuth((state) => state.initialize)
  const loading = useAuth((state) => state.loading)

  useEffect(() => { initialize() }, [initialize])

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Memuat BM Library…</div>
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-slate-500">Memuat halaman…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="users" element={<PermissionPage any={['users.view']}><UsersPage /></PermissionPage>} />
          <Route path="inventory" element={<PermissionPage any={['catalog.create']}><InventoryPage /></PermissionPage>} />
          <Route path="scan" element={<PermissionPage any={['circulation.borrow', 'circulation.return']}><ScanPage /></PermissionPage>} />
          <Route path="loans" element={<LoansPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="reports" element={<PermissionPage any={['reports.view']}><ReportsPage /></PermissionPage>} />
          <Route path="settings" element={<PermissionPage any={['settings.view', 'settings.manage']}><SettingsPage /></PermissionPage>} />
          <Route path="audit" element={<PermissionPage any={['audit.view']}><AuditPage /></PermissionPage>} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="forbidden" element={<AccessDeniedPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
