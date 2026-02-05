import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SubSystemSelection = () => {
  const { logout } = useAuth();
  const subSystems = [
    { id: 'control', name: 'Control Management', path: '/control' },
    { id: 'bookings', name: 'Bookings Management', path: '/bookings' },
    { id: 'procurement', name: 'Procurement Management', path: '/procurement' },
    { id: 'farm', name: 'Farm Management', path: '/farm' },
    { id: 'operations', name: 'Operations Management', path: '/operations' },
    { id: 'accounting', name: 'Accounting & Finance', path: '/accounting' },
    { id: 'performance', name: 'Performance Management', path: '/performance' },
  ];

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button 
          onClick={logout}
          style={{
            padding: '0.5rem 1rem',
            background: '#ff4d4f',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
      <h1>Select Sub-System</h1>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginTop: '2rem' 
      }}>
        {subSystems.map((system) => (
          <Link 
            key={system.id} 
            to={system.path}
            style={{
              padding: '2rem',
              border: '1px solid #ccc',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit',
              background: '#f9f9f9'
            }}
          >
            {system.name}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SubSystemSelection;

