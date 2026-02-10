import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MainLayout = ({ systemName }) => {
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      width: '100%',
      maxWidth: '100%',
      background: '#F5F5F5',
      fontFamily: "'Poppins', sans-serif",
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Top Navigation Bar */}
      <nav style={{ 
        padding: '0 20px', 
        background: '#FFFFFF', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '56px',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '16px', 
            fontWeight: '600', 
            color: '#333',
            letterSpacing: '-0.3px'
          }}>
            {systemName}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '6px 12px',
            background: '#F5F5F5',
            borderRadius: '6px'
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#1976D2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>
                {user?.username || 'User'}
              </div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                {user?.role || 'Role'}
              </div>
            </div>
          </div>
          <Link 
            to="/" 
            style={{ 
              padding: '6px 12px',
              borderRadius: '6px',
              background: '#F5F5F5',
              color: '#333',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#E0E0E0'}
            onMouseLeave={(e) => e.target.style.background = '#F5F5F5'}
          >
            Switch System
          </Link>
          <button 
            onClick={logout} 
            style={{ 
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: '#FF5722',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#E64A19'}
            onMouseLeave={(e) => e.target.style.background = '#FF5722'}
          >
            Logout
          </button>
        </div>
      </nav>
      
      {/* Main Content - Full Width */}
      <main style={{ 
        flex: 1, 
        padding: 0,
        overflow: 'auto',
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        boxSizing: 'border-box'
      }}>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;

