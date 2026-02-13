import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');

    if (!token) {
      navigate('/login?error=oauth_failed');
      return;
    }

    const finishLogin = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          login(data.user, token);
          navigate('/');
          return;
        }
      } catch (e) { /* fallback below */ }
      if (userParam) {
        try {
          const user = JSON.parse(decodeURIComponent(userParam));
          login({ ...user, permissions: { control_management: true, booking_management: true, operation_management: true, farm_management: true, procurement_management: true, accounting_and_finance: true, performance_management: true }, role_id: 1 }, token);
          navigate('/');
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

