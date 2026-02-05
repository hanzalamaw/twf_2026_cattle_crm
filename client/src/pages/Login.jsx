import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.user, data.token);
        navigate('/');
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setError('Could not connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: '#f4f7f6',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      <div style={{ 
        padding: '2.5rem', 
        background: '#fff', 
        borderRadius: '12px', 
        boxShadow: '0 8px 30px rgba(0,0,0,0.05)',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid #eaeaea'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            background: '#2d3436', 
            borderRadius: '10px', 
            margin: '0 auto 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: 'bold'
          }}>
            V
          </div>
          <h2 style={{ 
            margin: 0, 
            fontSize: '1.5rem', 
            color: '#2d3436',
            letterSpacing: '-0.02em'
          }}>
            Welcome Back
          </h2>
          <p style={{ color: '#636e72', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Please enter your details to sign in
          </p>
        </div>

        {error && (
          <div style={{ 
            background: '#fff5f5', 
            color: '#e03131', 
            padding: '0.75rem', 
            borderRadius: '6px', 
            fontSize: '0.85rem', 
            marginBottom: '1.5rem',
            border: '1px solid #ffc9c9',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.85rem', 
              fontWeight: '500', 
              color: '#2d3436', 
              marginBottom: '0.5rem' 
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                boxSizing: 'border-box',
                borderRadius: '8px',
                border: '1px solid #dfe6e9',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              required
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.85rem', 
              fontWeight: '500', 
              color: '#2d3436', 
              marginBottom: '0.5rem' 
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                boxSizing: 'border-box',
                borderRadius: '8px',
                border: '1px solid #dfe6e9',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              width: '100%', 
              padding: '0.85rem', 
              background: '#2d3436', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: isSubmitting ? 0.8 : 1
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#b2bec3', fontSize: '0.75rem' }}>
            © 2026 Enterprise Solutions
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

