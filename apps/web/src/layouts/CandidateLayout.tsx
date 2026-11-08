import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function CandidateLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="topbar">
        <span className="topbar-title">Signal</span>
        <nav className="topbar-tabs">
          <NavLink to="/candidate" end className={({ isActive }) => `topbar-tab ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/candidate/practice" className={({ isActive }) => `topbar-tab ${isActive ? 'active' : ''}`}>
            Practice
          </NavLink>
          <NavLink to="/candidate/mocks" className={({ isActive }) => `topbar-tab ${isActive ? 'active' : ''}`}>
            Mock Tests
          </NavLink>
          <NavLink to="/candidate/skill-report" className={({ isActive }) => `topbar-tab ${isActive ? 'active' : ''}`}>
            Skill Report
          </NavLink>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--muted-text)' }}>{user?.name}</span>
          <button className="btn btn-secondary" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </>
  );
}
