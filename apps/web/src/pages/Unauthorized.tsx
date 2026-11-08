import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Unauthorized() {
  const { user, logout } = useAuth();

  return (
    <div className="auth-container">
      <div className="auth-card panel" style={{ textAlign: 'center' }}>
        <h1>Access Denied</h1>
        <p>You do not have permission to view this page.</p>
        
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/logout" className="btn btn-secondary" onClick={logout}>
            Sign out
          </Link>
          <Link to={user?.role === 'student' ? '/candidate' : '/admin'} className="btn btn-primary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
