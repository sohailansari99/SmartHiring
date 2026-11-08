import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  role: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setState({ user, token, loading: false });
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setState(prev => ({ ...prev, loading: false }));
      }
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    
    localStorage.setItem('auth_token', token || '');
    localStorage.setItem('auth_user', JSON.stringify(data));
    setState({ user: data, token: token || null, loading: false });
  };

  const logout = () => {
    fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    setState({ user: null, token: null, loading: false });
  };

  const getToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] || null;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, getToken }}>
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
