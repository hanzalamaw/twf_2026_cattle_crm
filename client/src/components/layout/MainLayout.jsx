import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from '../Sidebar';
import './MainLayout.css';

const MainLayout = ({ systemName, showSidebar = true }) => {
  const { logout } = useAuth();

  const content = (
    <div className="layout-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <header style={{
        padding: '0 24px',
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {systemName ? <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>{systemName}</h1> : <span />}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/" style={{ fontSize: '13px', color: '#333', textDecoration: 'none' }}>Switch System</Link>
          <button type="button" onClick={logout} style={{ padding: '6px 12px', fontSize: '13px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: 0, boxSizing: 'border-box', minHeight: 0 }}>
        <Outlet />
      </main>
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      width: '100%',
      background: '#F9FAFB',
      fontFamily: "'Poppins', 'Plus Jakarta Sans', sans-serif",
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <div className="layout-wrapper" style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
        {showSidebar && <Sidebar />}
        {content}
      </div>
    </div>
  );
};

export default MainLayout;
