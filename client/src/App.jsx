import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SubSystemSelection from './pages/SubSystemSelection';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import Control from './pages/Control';
import Bookings from './pages/Bookings';
import Operations from './pages/Operations';
import Farm from './pages/Farm';
import Procurement from './pages/Procurement';
import Accounting from './pages/Accounting';
import Performance from './pages/Performance';
import Dashboard from './pages/Dashboard';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  return children;
};

const RequirePermission = ({ permission, children }) => {
  const { user } = useAuth();
  const permissions = user?.permissions || {};
  const allowed = permission === 'performance_management' ? true : !!permissions[permission];
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

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <SubSystemSelection />
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={<ProtectedRoute><RequireManager><MainLayout systemName="Dashboard" /></RequireManager></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
          </Route>

          <Route path="/control" element={<ProtectedRoute><RequirePermission permission="control_management"><MainLayout systemName="Control Management" showSidebar={false} /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Control />} />
          </Route>

          <Route path="/bookings" element={<ProtectedRoute><RequirePermission permission="booking_management"><MainLayout systemName="Bookings Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Bookings />} />
          </Route>

          <Route path="/operations" element={<ProtectedRoute><RequirePermission permission="operation_management"><MainLayout systemName="Operations Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Operations />} />
          </Route>

          <Route path="/farm" element={<ProtectedRoute><RequirePermission permission="farm_management"><MainLayout systemName="Farm Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Farm />} />
          </Route>

          <Route path="/procurement" element={<ProtectedRoute><RequirePermission permission="procurement_management"><MainLayout systemName="Procurement Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Procurement />} />
          </Route>

          <Route path="/accounting" element={<ProtectedRoute><RequirePermission permission="accounting_and_finance"><MainLayout systemName="Accounting & Finance" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Accounting />} />
          </Route>

          <Route path="/performance" element={<ProtectedRoute><RequirePermission permission="performance_management"><MainLayout systemName="Performance Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Performance />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
