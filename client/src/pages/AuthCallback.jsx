import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');
    const userParam = searchParams.get('user');

    if (!token) {
      navigate('/login?error=oauth_failed');
      return;
    }

    const finishLogin = async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          login(data.user, token, refreshToken || null);
          navigate(data.user.has_prev_logged_in ? '/' : '/accept-terms');
          return;
        }
      } catch (e) { /* fallback below */ }
      if (userParam) {
        try {
          const user = JSON.parse(decodeURIComponent(userParam));
          const userWithPerms = { ...user, permissions: { control_management: true, booking_management: true, operation_management: true, farm_management: true, procurement_management: true, accounting_and_finance: true, performance_management: true }, role_id: user.role_id || 1 };
          login(userWithPerms, token, refreshToken || null);
          navigate(user.has_prev_logged_in ? '/' : '/accept-terms');
        } catch (error) {
          navigate('/login?error=oauth_failed');
        }
      } else {
        navigate('/login?error=oauth_failed');
      }
    };
    finishLogin();
  }, [searchParams, login, navigate]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: "'Poppins', 'Inter', sans-serif"
    }}>
      <p>Completing login...</p>
    </div>
  );
};

export default AuthCallback;

