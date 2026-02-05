import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SubSystemSelection from './pages/SubSystemSelection';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Control from './pages/Control';
import Bookings from './pages/Bookings';
import Operations from './pages/Operations';
import Farm from './pages/Farm';
import Procurement from './pages/Procurement';
import Accounting from './pages/Accounting';
import Performance from './pages/Performance';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <SubSystemSelection />
            </ProtectedRoute>
          } />

          <Route path="/control" element={<ProtectedRoute><MainLayout systemName="Control Management" /></ProtectedRoute>}>
            <Route index element={<Control />} />
          </Route>

          <Route path="/bookings" element={<ProtectedRoute><MainLayout systemName="Bookings Management" /></ProtectedRoute>}>
            <Route index element={<Bookings />} />
          </Route>

          <Route path="/operations" element={<ProtectedRoute><MainLayout systemName="Operations Management" /></ProtectedRoute>}>
            <Route index element={<Operations />} />
          </Route>

          <Route path="/farm" element={<ProtectedRoute><MainLayout systemName="Farm Management" /></ProtectedRoute>}>
            <Route index element={<Farm />} />
          </Route>

          <Route path="/procurement" element={<ProtectedRoute><MainLayout systemName="Procurement Management" /></ProtectedRoute>}>
            <Route index element={<Procurement />} />
          </Route>

          <Route path="/accounting" element={<ProtectedRoute><MainLayout systemName="Accounting & Finance" /></ProtectedRoute>}>
            <Route index element={<Accounting />} />
          </Route>

          <Route path="/performance" element={<ProtectedRoute><MainLayout systemName="Performance Management" /></ProtectedRoute>}>
            <Route index element={<Performance />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
