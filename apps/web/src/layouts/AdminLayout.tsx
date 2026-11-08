import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Signal</div>
        <nav className="sidebar-nav">
          <NavLink to="/admin" end>Overview</NavLink>
          <NavLink to="/admin/tests">Tests</NavLink>
          <NavLink to="/admin/students">Students</NavLink>
          <NavLink to="/admin/candidates">Candidates</NavLink>
          <NavLink to="/admin/analytics">Analytics</NavLink>
          <NavLink to="/admin/company">Company</NavLink>
        </nav>
        
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>
            Signed in as<br />
            <strong>{user?.name}</strong>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
