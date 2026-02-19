import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Modal Component - defined outside to prevent recreation on each render
const Modal = ({ show, onClose, children, title, hasAnimated, maxWidth = '550px' }) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: !hasAnimated ? 'fadeIn 0.2s ease-out' : 'none',
        opacity: 1
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: maxWidth,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          animation: !hasAnimated ? 'slideUp 0.3s ease-out' : 'none',
          position: 'relative',
          transform: 'translateY(0)',
          opacity: 1
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#888',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#F5F5F5';
              e.target.style.color = '#333';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#888';
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Control = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAuditDetailModal, setShowAuditDetailModal] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const userModalMounted = useRef(false);
  const roleModalMounted = useRef(false);
  const auditModalMounted = useRef(false);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role_id: '',
    status: 'active'
  });
  const [roleFormData, setRoleFormData] = useState({
    role_name: '',
    control_management: false,
    booking_management: false,
    operation_management: false,
    farm_management: false,
    procurement_management: false,
    accounting_and_finance: false,
    performance_management: false
  });

  const getToken = () => localStorage.getItem('token');

  // Helper function to handle API responses and check for session termination
  const handleApiResponse = async (response) => {
    if (response.status === 401) {
      const data = await response.json();
      if (data.message === 'Session has been terminated' || data.message === 'Session has expired') {
        logout();
        navigate('/login');
        alert('Your session has been terminated. Please log in again.');
        return null;
      }
      throw new Error(data.message || 'Unauthorized');
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Request failed');
    }
    return await response.json();
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/control/users', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setUsers(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/control/roles', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setRoles(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/control/audit-logs?limit=50', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setAuditLogs(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/control/sessions', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSessions(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'roles') fetchRoles();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'sessions') fetchSessions();
    if (activeTab === 'dashboard') {
      fetchUsers();
      fetchRoles();
      fetchAuditLogs();
      fetchSessions();
    }
  }, [activeTab]);

  // Auto-hide messages
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingUser 
        ? `http://localhost:5000/api/control/users/${editingUser.user_id}`
        : 'http://localhost:5000/api/control/users';
      
      const method = editingUser ? 'PUT' : 'POST';
      const body = { ...userFormData };
      if (!editingUser && !body.password) {
        setError('Password is required for new users');
        return;
      }
      if (editingUser && !body.password) {
        delete body.password;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(body)
      });

      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message || 'User saved successfully');
        setShowUserModal(false);
        setEditingUser(null);
        setUserFormData({
          username: '',
          email: '',
          password: '',
          first_name: '',
          last_name: '',
          phone: '',
          role_id: '',
          status: 'active'
        });
        fetchUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Failed to save user');
      }
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingRole 
        ? `http://localhost:5000/api/control/roles/${editingRole.role_id}`
        : 'http://localhost:5000/api/control/roles';
      
      const method = editingRole ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(roleFormData)
      });

      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message || 'Role saved successfully');
        setShowRoleModal(false);
        setEditingRole(null);
        setRoleFormData({
          role_name: '',
          control_management: false,
          booking_management: false,
          operation_management: false,
          farm_management: false,
          procurement_management: false,
          accounting_and_finance: false,
          performance_management: false
        });
        fetchRoles();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Failed to save role');
      }
    } catch (err) {
      setError('Failed to save role');
    }
  };

  const openUserModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setShowUserPassword(false);
      setUserFormData({
        username: user.username,
        email: user.email,
        password: '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        phone: user.phone || '',
        role_id: user.role_id,
        status: user.status
      });
    } else {
      setEditingUser(null);
      setShowUserPassword(false);
      setUserFormData({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone: '',
        role_id: '',
        status: 'active'
      });
    }
    if (!showUserModal) {
      userModalMounted.current = false;
    }
    setShowUserModal(true);
  };
  
  useEffect(() => {
    if (showUserModal) {
      // Mark as mounted after a brief delay to allow animation
      const timer = setTimeout(() => {
        userModalMounted.current = true;
      }, 350);
      return () => clearTimeout(timer);
    } else {
      // Reset when modal closes
      userModalMounted.current = false;
    }
  }, [showUserModal]);

  const openRoleModal = (role = null) => {
    if (role) {
      setEditingRole(role);
      setRoleFormData({
        role_name: role.role_name,
        control_management: role.control_management || false,
        booking_management: role.booking_management || false,
        operation_management: role.operation_management || false,
        farm_management: role.farm_management || false,
        procurement_management: role.procurement_management || false,
        accounting_and_finance: role.accounting_and_finance || false,
        performance_management: role.performance_management || false
      });
    } else {
      setEditingRole(null);
      setRoleFormData({
        role_name: '',
        control_management: false,
        booking_management: false,
        operation_management: false,
        farm_management: false,
        procurement_management: false,
        accounting_and_finance: false,
        performance_management: false
      });
    }
    if (!showRoleModal) {
      roleModalMounted.current = false;
    }
    setShowRoleModal(true);
  };
  
  useEffect(() => {
    if (showRoleModal) {
      // Mark as mounted after a brief delay to allow animation
      const timer = setTimeout(() => {
        roleModalMounted.current = true;
      }, 350);
      return () => clearTimeout(timer);
    } else {
      // Reset when modal closes
      roleModalMounted.current = false;
    }
  }, [showRoleModal]);

  useEffect(() => {
    if (showAuditDetailModal) {
      // Mark as mounted after a brief delay to allow animation
      const timer = setTimeout(() => {
        auditModalMounted.current = true;
      }, 350);
      return () => clearTimeout(timer);
    } else {
      // Reset when modal closes
      auditModalMounted.current = false;
    }
  }, [showAuditDetailModal]);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const response = await fetch(`http://localhost:5000/api/control/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message);
        fetchUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    
    try {
      const response = await fetch(`http://localhost:5000/api/control/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message);
        fetchRoles();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to delete role');
    }
  };

  const handleTerminateSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to terminate this session?')) return;
    
    try {
      const response = await fetch(`http://localhost:5000/api/control/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message);
        fetchSessions();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to terminate session');
    }
  };


  // Dashboard View
  const renderDashboard = () => {
    const activeUsers = users.filter(u => u.status === 'active').length;
    const totalRoles = roles.length;
    const recentLogs = auditLogs.slice(0, 5);
    const activeSessionsCount = sessions.length;

    return (
      <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '6px' }}>
            Control Management Dashboard
          </h1>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Overview of system users, roles, and activities</p>
        </div>

        {/* Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '8px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            borderLeft: '4px solid #1976D2',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }}
          >
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: '500' }}>Total Users</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1976D2' }}>{users.length}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{activeUsers} active</div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '8px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            borderLeft: '4px solid #4CAF50',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }}
          >
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: '500' }}>Total Roles</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#4CAF50' }}>{totalRoles}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>System roles</div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '8px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            borderLeft: '4px solid #FF9800',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }}
          >
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: '500' }}>Active Sessions</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#FF9800' }}>{activeSessionsCount}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>Currently logged in</div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '8px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            borderLeft: '4px solid #9C27B0',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }}
          >
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: '500' }}>Audit Logs</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#9C27B0' }}>{auditLogs.length}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>Recent activities</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>Quick Actions</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  openUserModal();
                  setActiveTab('users');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#1976D2',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'}
                onMouseLeave={(e) => e.target.style.background = '#1976D2'}
              >
                + Add User
              </button>
              <button
                onClick={() => {
                  openRoleModal();
                  setActiveTab('roles');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#4CAF50',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#388E3C'}
                onMouseLeave={(e) => e.target.style.background = '#4CAF50'}
              >
                + Add Role
              </button>
              <button
                onClick={() => setActiveTab('users')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #E0E0E0',
                  background: '#FFFFFF',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#F5F5F5'}
                onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}
              >
                Manage Users
              </button>
            </div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>Recent Activity</h3>
            <div style={{ maxHeight: '160px', overflow: 'auto' }}>
              {recentLogs.length > 0 ? (
                recentLogs.map(log => (
                  <div key={log.log_id} style={{
                    padding: '8px 0',
                    borderBottom: '1px solid #F0F0F0',
                    fontSize: '11px'
                  }}>
                    <div style={{ color: '#333', fontWeight: '500' }}>{log.action}</div>
                    <div style={{ color: '#888', fontSize: '10px' }}>
                      {log.username} • {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#888', fontSize: '11px' }}>No recent activity</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // User Management View
  const renderUsers = () => (
    <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '4px' }}>
            User Management
          </h1>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Manage system users and their access</p>
        </div>
        <button
          onClick={() => openUserModal()}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#1976D2',
            color: '#FFFFFF',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(25, 118, 210, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#1565C0';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(25, 118, 210, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = '#1976D2';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 4px rgba(25, 118, 210, 0.3)';
          }}
        >
          + Add User
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
      ) : (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          padding: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          overflowX: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Username</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px', fontSize: '12px' }}>{u.username}</td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>{u.email}</td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>
                    {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '-'}
                  </td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>{u.role_name}</td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: '500',
                      background: u.status === 'active' ? '#E8F5E9' : u.status === 'suspended' ? '#FFEBEE' : '#F5F5F5',
                      color: u.status === 'active' ? '#2E7D32' : u.status === 'suspended' ? '#C62828' : '#666'
                    }}>
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openUserModal(u)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          border: '1px solid #E0E0E0',
                          background: '#FFFFFF',
                          color: '#1976D2',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#E3F2FD';
                          e.target.style.borderColor = '#1976D2';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#FFFFFF';
                          e.target.style.borderColor = '#E0E0E0';
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.user_id)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          border: '1px solid #E0E0E0',
                          background: '#FFFFFF',
                          color: '#C62828',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#FFEBEE';
                          e.target.style.borderColor = '#C62828';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#FFFFFF';
                          e.target.style.borderColor = '#E0E0E0';
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );


  return (
    <div style={{ 
      fontFamily: "'Poppins', sans-serif",
      width: '100%',
      maxWidth: '100%',
      minHeight: '100vh',
      background: '#F5F5F5',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box'
    }}>
      {/* Add CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Messages */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#FFF5F2',
          color: '#FF5722',
          padding: '14px 20px',
          borderRadius: '8px',
          marginBottom: '15px',
          border: '1px solid #FFE0D6',
          fontSize: '13px',
          zIndex: 999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideUp 0.3s ease-out'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#E8F5E9',
          color: '#2E7D32',
          padding: '14px 20px',
          borderRadius: '8px',
          marginBottom: '15px',
          border: '1px solid #C8E6C9',
          fontSize: '13px',
          zIndex: 999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideUp 0.3s ease-out'
        }}>
          {success}
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        background: '#FFFFFF',
        borderBottom: '1px solid #E0E0E0',
        padding: '0 20px'
      }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {['dashboard', 'users', 'roles', 'audit', 'sessions'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === tab ? '3px solid #1976D2' : '3px solid transparent',
                color: activeTab === tab ? '#1976D2' : '#666',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: activeTab === tab ? '600' : '400',
                textTransform: 'capitalize',
                transition: 'all 0.2s',
                marginBottom: '-1px'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab) {
                  e.target.style.color = '#1976D2';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) {
                  e.target.style.color = '#666';
                }
              }}
            >
              {tab === 'audit' ? 'Audit Logs' : tab === 'sessions' ? 'Active Sessions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'roles' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '4px' }}>
                Role Management
              </h1>
              <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Manage system roles and permissions</p>
            </div>
            <button
              onClick={() => openRoleModal()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#4CAF50',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(76, 175, 80, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#388E3C';
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 8px rgba(76, 175, 80, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#4CAF50';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 4px rgba(76, 175, 80, 0.3)';
              }}
            >
              + Add Role
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Role Name</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Permissions</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map(r => {
                    const permissions = [];
                    if (r.control_management) permissions.push('Control');
                    if (r.booking_management) permissions.push('Booking');
                    if (r.operation_management) permissions.push('Operation');
                    if (r.farm_management) permissions.push('Farm');
                    if (r.procurement_management) permissions.push('Procurement');
                    if (r.accounting_and_finance) permissions.push('Accounting');
                    if (r.performance_management) permissions.push('Performance');
                    
                    return (
                      <tr key={r.role_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px', fontSize: '12px', fontWeight: '500' }}>{r.role_name}</td>
                        <td style={{ padding: '10px', fontSize: '12px' }}>
                          {permissions.length > 0 ? permissions.join(', ') : 'No permissions'}
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => openRoleModal(r)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '5px',
                                border: '1px solid #E0E0E0',
                                background: '#FFFFFF',
                                color: '#4CAF50',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#E8F5E9';
                                e.target.style.borderColor = '#4CAF50';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#FFFFFF';
                                e.target.style.borderColor = '#E0E0E0';
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRole(r.role_id)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '5px',
                                border: '1px solid #E0E0E0',
                                background: '#FFFFFF',
                                color: '#C62828',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#FFEBEE';
                                e.target.style.borderColor = '#C62828';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#FFFFFF';
                                e.target.style.borderColor = '#E0E0E0';
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {activeTab === 'audit' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#333' }}>Audit Logs</h1>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Timestamp</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Entity</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr 
                      key={log.log_id} 
                      style={{ 
                        borderBottom: '1px solid #F0F0F0', 
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F0F7FF'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => {
                        setSelectedAuditLog(log);
                        if (!showAuditDetailModal) {
                          auditModalMounted.current = false;
                        }
                        setShowAuditDetailModal(true);
                      }}
                    >
                      <td style={{ padding: '10px', fontSize: '12px' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>{log.username || 'System'}</td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>{log.action}</td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>
                        {log.entity_type} {log.entity_id && `#${log.entity_id}`}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {activeTab === 'sessions' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#333' }}>Active Sessions</h1>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Role</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Login Time</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Last Activity</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>IP Address</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr key={session.session_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px', fontSize: '12px' }}>{session.username}</td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>{session.role_name}</td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>
                        {new Date(session.login_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>
                        {new Date(session.last_activity_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>{session.ip_address || '-'}</td>
                      <td style={{ padding: '10px', fontSize: '12px' }}>
                        <button
                          onClick={() => handleTerminateSession(session.session_id)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '5px',
                            border: '1px solid #E0E0E0',
                            background: '#FFFFFF',
                            color: '#C62828',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = '#FFEBEE';
                            e.target.style.borderColor = '#C62828';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = '#FFFFFF';
                            e.target.style.borderColor = '#E0E0E0';
                          }}
                        >
                          Terminate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showUserModal && (
        <Modal
          show={showUserModal}
          onClose={() => {
            setShowUserModal(false);
            setEditingUser(null);
            setShowUserPassword(false);
          }}
          title={editingUser ? 'Edit User' : 'Add User'}
          hasAnimated={userModalMounted.current}
        >
          <p style={{ fontSize: '11px', color: '#888', marginBottom: '16px' }}>
            Required to save user.
          </p>

          <form onSubmit={(e) => {
            e.preventDefault();
            handleUserSubmit(e);
          }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#333', marginBottom: '5px', fontWeight: '500' }}>
                Username <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="text"
                value={userFormData.username}
                onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #E0E0E0',
                  fontSize: '12px',
                  outline: 'none',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                Email <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E0E0E0',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <div style={{ marginBottom: '20px', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                Password {!editingUser && <span style={{ color: '#FF5722' }}>*</span>}
              </label>
              <input
                type={showUserPassword ? 'text' : 'password'}
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                required={!editingUser}
                placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E0E0E0',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
              />
              <button
                type="button"
                onClick={() => setShowUserPassword(!showUserPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '32px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#888',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0
                }}
                title={showUserPassword ? 'Hide password' : 'Show password'}
              >
                {showUserPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={userFormData.first_name}
                  onChange={(e) => setUserFormData({ ...userFormData, first_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E0E0E0',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                  onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                  Last Name
                </label>
                <input
                  type="text"
                  value={userFormData.last_name}
                  onChange={(e) => setUserFormData({ ...userFormData, last_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E0E0E0',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                  onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={userFormData.phone}
                onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E0E0E0',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                  Role <span style={{ color: '#FF5722' }}>*</span>
                </label>
                <select
                  value={userFormData.role_id}
                  onChange={(e) => setUserFormData({ ...userFormData, role_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E0E0E0',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                  onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
                >
                  <option value="">Select Role</option>
                  {roles.map(role => (
                    <option key={role.role_id} value={role.role_id}>{role.role_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
                  Status <span style={{ color: '#FF5722' }}>*</span>
                </label>
                <select
                  value={userFormData.status}
                  onChange={(e) => setUserFormData({ ...userFormData, status: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E0E0E0',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976D2'}
                  onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowUserModal(false);
                  setEditingUser(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #E0E0E0',
                  background: '#FFFFFF',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#F5F5F5'}
                onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleUserSubmit(e);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#1976D2',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'}
                onMouseLeave={(e) => e.target.style.background = '#1976D2'}
              >
                {editingUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      
      {/* Role Modal */}
      <Modal
        show={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setEditingRole(null);
        }}
        title={editingRole ? 'Edit Role' : 'Add Role'}
      >
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '24px' }}>
          Required to save role.
        </p>

        <form onSubmit={handleRoleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>
              Role Name <span style={{ color: '#FF5722' }}>*</span>
            </label>
            <input
              type="text"
              value={roleFormData.role_name}
              onChange={(e) => setRoleFormData({ ...roleFormData, role_name: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #E0E0E0',
                fontSize: '13px',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#1976D2'}
              onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}
            />
          </div>

          <div style={{ marginBottom: '25px', padding: '20px', background: '#F9F9F9', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginTop: 0, marginBottom: '15px' }}>System Access Permissions</h3>
            
            {[
              { key: 'control_management', label: 'Control Management' },
              { key: 'booking_management', label: 'Booking Management' },
              { key: 'operation_management', label: 'Operation Management' },
              { key: 'farm_management', label: 'Farm Management' },
              { key: 'procurement_management', label: 'Procurement Management' },
              { key: 'accounting_and_finance', label: 'Accounting & Finance' },
              { key: 'performance_management', label: 'Performance Management' }
            ].map(perm => (
              <div key={perm.key} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id={perm.key}
                  checked={roleFormData[perm.key]}
                  onChange={(e) => setRoleFormData({ ...roleFormData, [perm.key]: e.target.checked })}
                  style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor={perm.key} style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>
                  {perm.label}
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '30px' }}>
            <button
              type="button"
              onClick={() => {
                setShowRoleModal(false);
                setEditingRole(null);
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #E0E0E0',
                background: '#FFFFFF',
                color: '#333',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#F5F5F5'}
              onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#4CAF50',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#388E3C'}
              onMouseLeave={(e) => e.target.style.background = '#4CAF50'}
            >
              {editingRole ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Audit Log Detail Modal */}
      {selectedAuditLog && (
        <Modal
          show={showAuditDetailModal}
          onClose={() => {
            setShowAuditDetailModal(false);
            setSelectedAuditLog(null);
          }}
          title={`Audit Log Details - ${selectedAuditLog.action}`}
          hasAnimated={auditModalMounted.current}
          maxWidth="800px"
        >
          <div style={{ marginBottom: '20px' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '16px',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>User</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                  {selectedAuditLog.username || 'System'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Timestamp</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                  {new Date(selectedAuditLog.created_at).toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Entity Type</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                  {selectedAuditLog.entity_type}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Entity ID</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                  {selectedAuditLog.entity_id || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>IP Address</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                  {selectedAuditLog.ip_address || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>User Agent</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>
                  {selectedAuditLog.user_agent || 'N/A'}
                </div>
              </div>
            </div>

            {/* Parse and display old_values and new_values */}
            {(() => {
              let oldValues = null;
              let newValues = null;
              
              try {
                if (selectedAuditLog.old_values) {
                  oldValues = typeof selectedAuditLog.old_values === 'string' 
                    ? JSON.parse(selectedAuditLog.old_values) 
                    : selectedAuditLog.old_values;
                }
                if (selectedAuditLog.new_values) {
                  newValues = typeof selectedAuditLog.new_values === 'string' 
                    ? JSON.parse(selectedAuditLog.new_values) 
                    : selectedAuditLog.new_values;
                }
              } catch (e) {
                console.error('Error parsing audit log values:', e);
              }

              const actionUpper = selectedAuditLog.action.toUpperCase();
              const isUpdate = actionUpper.includes('UPDATE') || actionUpper.includes('EDIT');
              const isCreate = actionUpper.includes('CREATE') || actionUpper.includes('ADD');
              const isDelete = actionUpper.includes('DELETE') || actionUpper.includes('REMOVE');
              const isCancelOrder = actionUpper === 'CANCEL_ORDER';
              const isOrderExport = actionUpper === 'ORDER_EXPORT';

              return (
                <div>
                  {isUpdate && (oldValues || newValues) && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Changes Made (before → after)
                      </h3>
                      <div style={{
                        background: '#F9F9F9',
                        borderRadius: '8px',
                        padding: '16px',
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Field</th>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Old value (replaced)</th>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>New value (replaced with)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys({ ...(oldValues || {}), ...(newValues || {}) })
                              .filter((key) => key !== 'order_id')
                              .map(key => {
                                const oldVal = oldValues && oldValues[key];
                                const newVal = newValues && newValues[key];
                                const toDatePart = (v) => {
                                  if (v == null || v === '') return v;
                                  if (v instanceof Date) {
                                    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
                                    return `${y}-${m}-${d}`;
                                  }
                                  const s = String(v);
                                  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
                                  if (m) return m[1];
                                  const parsed = new Date(v);
                                  if (!Number.isNaN(parsed.getTime())) {
                                    const y = parsed.getFullYear(), mo = String(parsed.getMonth() + 1).padStart(2, '0'), d = String(parsed.getDate()).padStart(2, '0');
                                    return `${y}-${mo}-${d}`;
                                  }
                                  return s;
                                };
                                const oldNorm = key === 'booking_date' ? toDatePart(oldVal) : oldVal;
                                const newNorm = key === 'booking_date' ? toDatePart(newVal) : newVal;
                                const changed = key === 'booking_date'
                                  ? (oldNorm != null && newNorm != null && String(oldNorm) !== String(newNorm))
                                  : (oldNorm !== newNorm);
                                const displayOld = oldVal !== null && oldVal !== undefined ? String(key === 'booking_date' ? (toDatePart(oldVal) ?? '—') : oldVal) : '—';
                                const displayNew = newVal !== null && newVal !== undefined ? String(key === 'booking_date' ? (toDatePart(newVal) ?? '—') : newVal) : '—';
                                return (
                                  <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                                    <td style={{ padding: '8px', fontSize: '12px', fontWeight: '500', color: '#333' }}>
                                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </td>
                                    <td style={{ padding: '8px', fontSize: '12px', color: changed ? '#C62828' : '#666', textDecoration: changed ? 'line-through' : 'none' }}>
                                      {displayOld}
                                    </td>
                                    <td style={{ padding: '8px', fontSize: '12px', color: changed ? '#2E7D32' : '#666', fontWeight: changed ? '500' : '400' }}>
                                      {displayNew}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {isCancelOrder && newValues && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Cancelled order details
                      </h3>
                      <div style={{ background: '#FFF5F5', borderRadius: '8px', padding: '16px', maxHeight: '400px', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Field</th>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(newValues).map(([key, value]) => (
                              <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                                <td style={{ padding: '8px', fontSize: '12px', fontWeight: '500', color: '#333' }}>
                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#333' }}>
                                  {value !== null && value !== undefined ? String(value) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {isOrderExport && newValues && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Export summary
                      </h3>
                      <div style={{ background: '#F0F7FF', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.7' }}>
                          <div><strong>Rows exported:</strong> {newValues.count ?? 0}</div>
                          {newValues.order_ids && newValues.order_ids.length > 0 ? (
                            <div style={{ marginTop: '8px' }}>
                              <strong>Selected order IDs:</strong>
                              <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                                {newValues.order_ids.join(', ')}
                              </div>
                            </div>
                          ) : newValues.filters && Object.keys(newValues.filters).length > 0 ? (
                            <div style={{ marginTop: '8px' }}>
                              <strong>Filters applied:</strong>
                              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                {Object.entries(newValues.filters).map(([k, v]) => (
                                  <li key={k}>{k.replace(/_/g, ' ')}: {String(v)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div style={{ marginTop: '8px', color: '#2E7D32' }}>All data exported (no filters, no selection)</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {isCreate && newValues && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Created Data
                      </h3>
                      <div style={{
                        background: '#F9F9F9',
                        borderRadius: '8px',
                        padding: '16px',
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Field</th>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(newValues).map(([key, value]) => (
                              <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                                <td style={{ padding: '8px', fontSize: '12px', fontWeight: '500', color: '#333' }}>
                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#333' }}>
                                  {value !== null && value !== undefined ? String(value) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {isDelete && oldValues && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Deleted Data
                      </h3>
                      <div style={{
                        background: '#F9F9F9',
                        borderRadius: '8px',
                        padding: '16px',
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Field</th>
                              <th style={{ textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(oldValues).map(([key, value]) => (
                              <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                                <td style={{ padding: '8px', fontSize: '12px', fontWeight: '500', color: '#333' }}>
                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#C62828' }}>
                                  {value !== null && value !== undefined ? String(value) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!isUpdate && !isCreate && !isDelete && !isCancelOrder && !isOrderExport && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                        Action Details
                      </h3>
                      <div style={{
                        background: '#F9F9F9',
                        borderRadius: '8px',
                        padding: '16px'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Action:</strong> {selectedAuditLog.action}
                          </div>
                          {newValues && Object.keys(newValues).length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Additional Information:</div>
                              {Object.entries(newValues).map(([key, value]) => (
                                <div key={key} style={{ marginBottom: '4px', fontSize: '12px' }}>
                                  <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAuditDetailModal(false);
                  setSelectedAuditLog(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#1976D2',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'}
                onMouseLeave={(e) => e.target.style.background = '#1976D2'}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Control;
