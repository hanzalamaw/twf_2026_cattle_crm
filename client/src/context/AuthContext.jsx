import { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      if (!parsed.permissions || parsed.role_id == null) {
        fetch('http://localhost:5000/api/me', { headers: { Authorization: `Bearer ${token}` } })
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.user) {
              setUser(data.user);
              localStorage.setItem('user', JSON.stringify(data.user));
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
        return;
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

