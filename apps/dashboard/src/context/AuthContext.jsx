import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('swarm_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
        headers
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // If server returns token on /me, save it
        if (data.token) {
          localStorage.setItem('swarm_token', data.token);
        }
      } else {
        setUser(null);
        localStorage.removeItem('swarm_token');
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    setUser(data.user);
    
    // Save token to localStorage for WebSocket auth
    if (data.token) {
      localStorage.setItem('swarm_token', data.token);
    }
    
    return data;
  };

  const logout = async () => {
    const token = localStorage.getItem('swarm_token');
    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });
    } catch {
      // Logout endpoint may fail, but we still clear local state
    } finally {
      setUser(null);
      localStorage.removeItem('swarm_token');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
