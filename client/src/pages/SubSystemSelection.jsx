import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OPTIONS = [
  { id: 'control', name: 'Control Management', path: '/control', permission: 'control_management' },
  { id: 'bookings', name: 'Bookings Management', path: '/bookings', permission: 'booking_management' },
  { id: 'operations', name: 'Operations Management', path: '/operations', permission: 'operation_management' },
  { id: 'farm', name: 'Farm Management', path: '/farm', permission: 'farm_management' },
  { id: 'procurement', name: 'Procurement Management', path: '/procurement', permission: 'procurement_management' },
  { id: 'accounting', name: 'Accounting & Finance', path: '/accounting', permission: 'accounting_and_finance' },
  { id: 'performance', name: 'Performance Management', path: '/performance', permission: 'performance_management' },
];

const SubSystemSelection = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accessBlocked, setAccessBlocked] = useState(null);

  const permissions = user?.permissions || {};
  const hasAccess = (perm) => (perm === 'performance_management' ? true : !!permissions[perm]);

  const btnStyle = {
    padding: '16px 20px',
    textAlign: 'center',
    background: '#FAFAFA',
    border: '1px solid #F0F0F0',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
  };

  const handleClick = (option) => {
    if (!hasAccess(option.permission)) {
      setAccessBlocked(option.name);
      return;
    }
    setAccessBlocked(null);
    navigate(option.path);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: '#FFFFFF',
      fontFamily: "'Poppins', 'Inter', sans-serif",
      padding: '40px 20px',
      boxSizing: 'border-box',
      margin: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'auto',
    }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '920px', flexShrink: 0 }}>
        {/* Back Card 2 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFE4DB',
          borderRadius: '24px',
          transform: 'rotate(2deg) translate(6px, 8px)',
          animation: 'cardDrift1 6s ease-in-out infinite',
          zIndex: 0,
        }} />
        {/* Back Card 1 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFEDE6',
          borderRadius: '22px',
          transform: 'rotate(-1.5deg) translate(-5px, -6px)',
          animation: 'cardDrift2 5s ease-in-out infinite',
          zIndex: 1,
        }} />
        {/* Main White Card - no image, content only */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          position: 'relative',
          padding: '30px',
          boxSizing: 'border-box',
          zIndex: 2,
          boxShadow: '0 5px 25px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            padding: '28px',
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Cattle CRM</p>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Select Management</h1>
              </div>
              <button
                type="button"
                onClick={logout}
                style={{
                  padding: '8px 14px',
                  background: '#FFF5F2',
                  border: '1px solid #FFE0D6',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#FF5722',
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            </div>

            {accessBlocked && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                background: '#FFF5F2',
                border: '1px solid #FFE0D6',
                borderRadius: '8px',
                color: '#FF5722',
                fontSize: '12px',
              }}>
                Access blocked. You do not have permission to open {accessBlocked}.
              </div>
            )}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {OPTIONS.slice(0, 4).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleClick(option)}
                    style={btnStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFEDE6'; e.currentTarget.style.borderColor = '#FFE0D6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#F0F0F0'; }}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {OPTIONS.slice(4, 7).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleClick(option)}
                    style={btnStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFEDE6'; e.currentTarget.style.borderColor = '#FFE0D6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#F0F0F0'; }}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>
        {`
          @keyframes cardDrift1 {
            0%, 100% { transform: rotate(2deg) translate(6px, 8px); }
            50% { transform: rotate(3deg) translate(10px, -4px); }
          }
          @keyframes cardDrift2 {
            0%, 100% { transform: rotate(-1.5deg) translate(-5px, -6px); }
            50% { transform: rotate(-2.5deg) translate(-8px, 6px); }
          }
        `}
      </style>
    </div>
  );
};

export default SubSystemSelection;
