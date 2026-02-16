import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar';
import './MainLayout.css';

const MainLayout = ({ showSidebar = true }) => {
  const content = (
    <div className="layout-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
