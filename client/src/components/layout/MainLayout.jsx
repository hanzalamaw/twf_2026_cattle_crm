import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MainLayout = ({ systemName }) => {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ 
        padding: '1rem', 
        background: '#333', 
        color: '#fff', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontWeight: 'bold' }}>{systemName}</div>
        <div>
          <Link to="/" style={{ color: '#fff', marginRight: '1rem' }}>Switch System</Link>
          <button 
            onClick={logout} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#fff', 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Logout
          </button>
        </div>
      </nav>
      <div style={{ display: 'flex', flex: 1 }}>
        <aside style={{ 
          width: '200px', 
          background: '#eee', 
          padding: '1rem',
          borderRight: '1px solid #ddd'
        }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li><Link to={`${location.pathname}`}>Dashboard</Link></li>
            {/* Add sub-system specific links here later */}
          </ul>
        </aside>
        <main style={{ flex: 1, padding: '2rem' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;

