import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const DashboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const ControlIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const BookingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const OperationsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const FarmIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v4"/>
    <path d="M16 3v4"/>
    <rect x="3" y="11" width="18" height="10" rx="1"/>
    <path d="M12 11v10"/>
    <path d="M3 15h18"/>
  </svg>
);

const ProcurementIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const AccountingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
    <path d="M7 14h.01M7 18h.01"/>
  </svg>
);

const PerformanceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
    <path d="M22 12A10 10 0 0 0 12 2v10z"/>
  </svg>
);

const QueryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const OrderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const TransactionsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const ExpensesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const ChevronIcon = ({ direction = 'right' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: direction === 'left' ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', managersOnly: true },
  { id: 'control', label: 'Control Management', icon: <ControlIcon />, path: '/control', permission: 'control_management' },
  { id: 'bookings', label: 'Bookings Management', icon: <BookingsIcon />, path: '/bookings', permission: 'booking_management' },
  { id: 'operations', label: 'Operations Management', icon: <OperationsIcon />, path: '/operations', permission: 'operation_management' },
  { id: 'farm', label: 'Farm Management', icon: <FarmIcon />, path: '/farm', permission: 'farm_management' },
  { id: 'procurement', label: 'Procurement Management', icon: <ProcurementIcon />, path: '/procurement', permission: 'procurement_management' },
  { id: 'accounting', label: 'Accounting & Finance', icon: <AccountingIcon />, path: '/accounting', permission: 'accounting_and_finance' },
  { id: 'performance', label: 'Performance Management', icon: <PerformanceIcon />, path: '/performance', permission: 'performance_management' },
];

const BOOKING_MENU_ITEMS = [
  { id: 'bm-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/bookings/dashboard', managersOnly: true },
  { id: 'bm-new-query', label: 'New Query', iconDefault: '/icons/new_query_default.png', iconActive: '/icons/new_query_active.png', path: '/bookings/new-query', permission: 'booking_management' },
  { id: 'bm-new-order', label: 'New Order', iconDefault: '/icons/new_order_default.png', iconActive: '/icons/new_order_active.png', path: '/bookings/new-order', permission: 'booking_management' },
  { id: 'bm-queries', label: 'Query Management', iconDefault: '/icons/query_management_default.png', iconActive: '/icons/query_management_active.png', path: '/bookings/queries', permission: 'booking_management' },
  { id: 'bm-orders', label: 'Order Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/bookings/orders', permission: 'booking_management' },
  { id: 'bm-transactions', label: 'Transactions', iconDefault: '/icons/transactions_default.png', iconActive: '/icons/transactions_active.png', path: '/bookings/transactions', permission: 'booking_management' },
  { id: 'bm-expenses', label: 'Expenses', iconDefault: '/icons/expenses_default.png', iconActive: '/icons/expenses_active.png', path: '/bookings/expenses', permission: 'booking_management' },
];

function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const permissions = user?.permissions || {};
  const roleId = user?.role_id;
  const isManager = [3, 5, 7].includes(roleId);
  const isBookingContext = location.pathname.startsWith('/bookings');

  const isAdminOrManager = [1, 2, 3, 5, 7].includes(roleId);
  const items = isBookingContext ? BOOKING_MENU_ITEMS : MENU_ITEMS;
  const visibleItems = items.filter((item) => {
    if (item.managersOnly) {
      return isBookingContext ? isAdminOrManager : isManager;
    }
    if (item.permission) return item.permission === 'performance_management' ? true : !!permissions[item.permission];
    return true;
  });

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="sidebar-profile">
        <div className="profile-avatar">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face" alt="Profile" />
        </div>
        {isExpanded && (
          <div className="profile-info">
            <span className="profile-role">{user?.role || 'USER'}</span>
            <span className="profile-name">{user?.username || 'User'}</span>
            <button type="button" className="logout-btn" onClick={handleLogout}>
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </div>
        )}
        {!isExpanded && (
          <button type="button" className="logout-btn-collapsed" onClick={handleLogout} title="Logout">
            <LogoutIcon />
          </button>
        )}
        <button type="button" className="toggle-btn" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
          <ChevronIcon direction={isExpanded ? 'left' : 'right'} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">{isExpanded ? (isBookingContext ? 'BOOKING MANAGEMENT' : 'MANAGEMENT') : ''}</span>
        <ul className="nav-list">
          {visibleItems.map((item) => (
            <li key={item.id} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
              <button
                type="button"
                className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-icon nav-icon-main">
                  {item.iconDefault ? (
                    <img src={isActive(item.path) ? item.iconActive : item.iconDefault} alt="" style={{ width: '24px', height: '24px', display: 'block' }} />
                  ) : (
                    item.icon
                  )}
                </span>
                {isExpanded && <span className="nav-label">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="nav-link sidebar-back-btn"
          onClick={() => navigate('/')}
          title="Back to Select Management"
        >
          <span className="nav-icon">
            <img src="/icons/select_system.png" alt="" style={{ width: '20px', height: '20px', display: 'block' }} />
          </span>
          {isExpanded && <span className="nav-label nav-label-back">Select Management</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
