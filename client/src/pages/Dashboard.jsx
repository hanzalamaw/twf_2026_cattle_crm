import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div style={{ padding: '24px', fontFamily: "'Poppins', sans-serif" }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Dashboard</h1>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Welcome, {user?.username || 'Manager'}. This is your department dashboard.
      </p>
    </div>
  );
};

export default Dashboard;
