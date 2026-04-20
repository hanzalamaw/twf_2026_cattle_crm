import { useEffect } from 'react';
import { API_BASE } from './config/api';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SubSystemSelectionV2 from './pages/SubSystemSelectionV2';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import Control from './pages/Control';
import Operations from './pages/Operations';
import OperationsLayout from './pages/OperationsLayout';
import OperationsDeliveries from './pages/OperationsDeliveries';
import OperationsChallan from './pages/OperationsChallan';
import OperationsGeneral from './pages/OperationsGeneral';
import OperationsSupport from './pages/OperationsSupport';
import OperationsRiders from './pages/OperationsRiders';
import OperationPlaceholder from './pages/OperationPlaceholder';
import ProcurementDashboard from './pages/ProcurementDashboard';
import NewProcurement from './pages/NewProcurement';
import ProcurementManagement from './pages/ProcurementManagement';
import AccountingTransactions from './pages/AccountingTransactions';
import AccountingExpenses from './pages/AccountingExpenses';
import PerformanceAdmin from './pages/PerformanceAdmin';
import PerformanceDashboard from './pages/PerformanceDashboard';
import Dashboard from './pages/Dashboard';
import BookingPlaceholder from './pages/BookingPlaceholder';
import AcceptTerms from './pages/AcceptTerms';
import OrderManagement from './pages/OrderManagement';
import QueryManagement from './pages/QueryManagement';
import Transactions from './pages/Transactions';
import Expenses from './pages/Expenses';
import NewOrder from './pages/NewOrder';
import NewQuery from './pages/NewQuery';
import Stats from './pages/Stats';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname || '/');
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
};

const RequirePermission = ({ permission, children }) => {
  const { user } = useAuth();
  const permissions = user?.permissions || {};
  const allowed = !!permissions[permission];
  if (!allowed) return <Navigate to="/" replace />;
  return children;
};

const RequireManager = ({ children }) => {
  const { user } = useAuth();
  const roleId = user?.role_id;
  const isManager = [3, 5, 7].includes(roleId);
  if (!isManager) return <Navigate to="/" replace />;
  return children;
};

const RequireBookingDashboard = ({ children }) => {
  const { user } = useAuth();
  const roleId = user?.role_id;
  const canSeeBookingDashboard = [1, 2, 3, 5, 7].includes(roleId);
  if (!canSeeBookingDashboard) return <Navigate to="/bookings" replace />;
  return children;
};

const STAFF_BOOKINGS_ROLE = 'Staff - Bookings';
const CO_MANAGER_BOOKINGS_ROLE = 'Co-Manager - Bookings';

function bookingDefaultPath(role) {
  if (role === STAFF_BOOKINGS_ROLE || role === CO_MANAGER_BOOKINGS_ROLE) return '/bookings/new-query';
  return '/bookings/dashboard';
}

function isBookingPathAllowedForRole(role, pathname) {
  if (role === STAFF_BOOKINGS_ROLE) {
    return pathname === '/bookings/new-query' || pathname === '/bookings/queries';
  }
  if (role === CO_MANAGER_BOOKINGS_ROLE) {
    return pathname === '/bookings/new-query' || pathname === '/bookings/queries' || pathname === '/bookings/transactions';
  }
  return true;
}

const BookingsIndexRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={bookingDefaultPath(user?.role)} replace />;
};

const RequireBookingRoleAccess = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role;
  if (!isBookingPathAllowedForRole(role, location.pathname)) {
    return <Navigate to={bookingDefaultPath(role)} replace />;
  }
  return children;
};

const RequireOperationSub = ({ permission, children }) => {
  const { user } = useAuth();
  const p = user?.permissions || {};
  if (!p.operation_management) return <Navigate to="/" replace />;
  if (!p[permission]) return <Navigate to="/operations" replace />;
  return children;
};

const RequireDeliveriesOnly = ({ children }) => {
  const { user } = useAuth();
  const p = user?.permissions || {};
  if (!p.operation_management) return <Navigate to="/" replace />;
  if (!p.operation_deliveries_management) return <Navigate to="/operations" replace />;
  return children;
};

const RequireChallanOnly = ({ children }) => {
  const { user } = useAuth();
  const p = user?.permissions || {};
  if (!p.operation_management) return <Navigate to="/" replace />;
  if (!p.operation_challan_management) return <Navigate to="/operations" replace />;
  return children;
};

const TermsOrHome = () => {
  const { user } = useAuth();
  if (user && !user.has_prev_logged_in) {
    return <Navigate to="/accept-terms" replace />;
  }
  return <SubSystemSelectionV2 />;
};

const ROUTE_TITLES = {
  '/login': 'Login',
  '/register': 'Register',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
  '/auth/callback': 'Signing in…',
  '/accept-terms': 'Accept Terms',
  '/': 'Select Management',
  '/dashboard': 'Dashboard',
  '/control': 'Control Management',
  '/bookings': 'Booking Management',
  '/bookings/dashboard': 'Dashboard',
  '/bookings/new-query': 'New Query',
  '/bookings/new-order': 'New Order',
  '/bookings/queries': 'Query Management',
  '/bookings/orders': 'Order Management',
  '/bookings/transactions': 'Transactions',
  '/bookings/expenses': 'Expenses',
  '/operations': 'Operations Management',
  '/operations/general': 'Operations — General',
  '/operations/support': 'Operations — Support',
  '/operations/riders': 'Operations — Riders',
  '/operations/deliveries': 'Deliveries Management',
  '/operations/challan': 'Challan Management',
  '/farm': 'Farm Management',
  '/farm/dashboard': 'Farm Dashboard',
  '/farm/new-query': 'New Query',
  '/farm/new-order': 'New Order',
  '/farm/query-management': 'Query Management',
  '/farm/orders': 'Order Management',
  '/farm/transactions': 'Transactions',
  '/farm/expenses': 'Expenses',
  '/procurement': 'Procurement Management',
  '/procurement/dashboard': 'Dashboard',
  '/procurement/new-procurement': 'New Procurement',
  '/procurement/manage': 'Procurement Management',
  '/procurement/transactions': 'Transactions',
  '/procurement/expenses': 'Expenses',
  '/accounting': 'Accounting & Finance',
  '/accounting/dashboard': 'Accounting & Finance',
  '/accounting/transactions': 'Transactions',
  '/accounting/expenses': 'Expenses',
  '/performance': 'Performance Management',
  '/performance/admin': 'Performance Admin',
  '/performance/dashboard': 'Performance Dashboard',
  '/stats': 'Stats',
};

function clearSessionAndRedirectToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function AuthFetchInterceptor() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await originalFetch.apply(this, args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const isApi = url.includes('/api/');
      const isAuthEndpoint = /\/api\/(login|register|refresh|forgot-password|reset-password|accept-terms)/.test(url);
      if (res.status === 401 && isApi && !isAuthEndpoint) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          clearSessionAndRedirectToLogin();
          return res;
        }
        try {
          const refreshRes = await originalFetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!refreshRes.ok) {
            clearSessionAndRedirectToLogin();
            return res;
          }
          const data = await refreshRes.json().catch(() => ({}));
          if (!data?.token) {
            clearSessionAndRedirectToLogin();
            return res;
          }
          localStorage.setItem('token', data.token);
          const newHeaders = { ...(args[1]?.headers || {}), Authorization: `Bearer ${data.token}` };
          return originalFetch(args[0], { ...args[1], headers: newHeaders });
        } catch {
          clearSessionAndRedirectToLogin();
          return res;
        }
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, [user]);
  return null;
}

function DocumentTitle() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const title = ROUTE_TITLES[path] || ROUTE_TITLES[path.replace(/\/$/, '')] || 'Cattle CRM';
    document.title = title === 'Cattle CRM' ? title : `${title} | Cattle CRM`;
  }, [location.pathname]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <DocumentTitle />
        <AuthFetchInterceptor />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route path="/accept-terms" element={
            <ProtectedRoute>
              <AcceptTerms />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <TermsOrHome />
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={<ProtectedRoute><RequireManager><MainLayout systemName="Dashboard" /></RequireManager></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
          </Route>

          <Route path="/control" element={<ProtectedRoute><RequirePermission permission="control_management"><MainLayout systemName="Control Management" showSidebar={false} /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Control />} />
          </Route>

          <Route path="/bookings" element={<ProtectedRoute><RequirePermission permission="booking_management"><MainLayout systemName="" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<BookingsIndexRedirect />} />
            <Route path="dashboard" element={<RequireBookingRoleAccess><Dashboard /></RequireBookingRoleAccess>} />
            <Route path="new-query" element={<RequireBookingRoleAccess><NewQuery /></RequireBookingRoleAccess>} />
            <Route path="new-order" element={<RequireBookingRoleAccess><NewOrder /></RequireBookingRoleAccess>} />
            <Route path="queries" element={<RequireBookingRoleAccess><QueryManagement /></RequireBookingRoleAccess>} />
            <Route path="orders" element={<RequireBookingRoleAccess><OrderManagement /></RequireBookingRoleAccess>} />
            <Route path="transactions" element={<RequireBookingRoleAccess><Transactions /></RequireBookingRoleAccess>} />
            <Route path="expenses" element={<RequireBookingRoleAccess><Expenses /></RequireBookingRoleAccess>} />
          </Route>

          <Route path="/operations" element={<ProtectedRoute><RequirePermission permission="operation_management"><MainLayout showSidebar={false} systemName="Operations Management" /></RequirePermission></ProtectedRoute>}>
            <Route element={<OperationsLayout />}>
              <Route index element={<Operations />} />
              <Route path="general" element={<RequireOperationSub permission="operation_general_dashboard"><OperationsGeneral /></RequireOperationSub>} />
              <Route path="support" element={<RequireOperationSub permission="operation_customer_support"><OperationsSupport /></RequireOperationSub>} />
              <Route path="riders" element={<RequireOperationSub permission="operation_rider_management"><OperationsRiders /></RequireOperationSub>} />
              <Route path="deliveries" element={<RequireDeliveriesOnly><OperationsDeliveries /></RequireDeliveriesOnly>} />
              <Route path="challan" element={<RequireChallanOnly><OperationsChallan /></RequireChallanOnly>} />
            </Route>
          </Route>

          <Route path="/farm" element={<ProtectedRoute><RequirePermission permission="farm_management"><MainLayout systemName="Farm Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/farm/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="new-query" element={<NewQuery />} />
            <Route path="new-order" element={<NewOrder />} />
            <Route path="query-management" element={<QueryManagement />} />
            <Route path="orders" element={<OrderManagement />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="expenses" element={<Expenses />} />
          </Route>

          <Route path="/procurement" element={<ProtectedRoute><RequirePermission permission="procurement_management"><MainLayout systemName="Procurement Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/procurement/dashboard" replace />} />
            <Route path="dashboard" element={<ProcurementDashboard />} />
            <Route path="new-procurement" element={<NewProcurement />} />
            <Route path="manage" element={<ProcurementManagement />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="expenses" element={<Expenses />} />
          </Route>

          <Route path="/accounting" element={<ProtectedRoute><RequirePermission permission="accounting_and_finance"><MainLayout systemName="Accounting & Finance" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/accounting/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="transactions" element={<AccountingTransactions />} />
            <Route path="expenses" element={<AccountingExpenses />} />
          </Route>

          <Route path="/performance" element={<ProtectedRoute><RequirePermission permission="performance_management"><MainLayout systemName="Performance Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/performance/admin" replace />} />
            <Route path="admin" element={<PerformanceAdmin />} />
            <Route path="dashboard" element={<PerformanceDashboard />} />
          </Route>

          <Route path="/stats" element={
            <ProtectedRoute>
              <Stats />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;