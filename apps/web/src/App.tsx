import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import CandidateLayout from './layouts/CandidateLayout';
import Unauthorized from './pages/Unauthorized';

// Protected route wrapper
function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="empty-state"><p>Loading...</p></div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'student' ? '/candidate' : '/admin'} replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="company_admin">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<AdminOverview />} />
            <Route path="tests" element={<div className="panel sunken"><h3>Tests — placeholder</h3><p>Phase 2 feature</p></div>} />
            <Route path="students" element={<div className="panel sunken"><h3>Students — placeholder</h3><p>Phase 2 feature</p></div>} />
            <Route path="company" element={<div className="panel sunken"><h3>Company settings</h3><p>Phase 2 feature</p></div>} />
          </Route>
          
          {/* Candidate routes */}
          <Route path="/candidate" element={
            <ProtectedRoute requiredRole="student">
              <CandidateLayout />
            </ProtectedRoute>
          }>
            <Route index element={<CandidateHome />} />
            <Route path="practice" element={<div className="panel sunken"><h3>Practice — placeholder</h3><p>Phase 2 feature</p></div>} />
            <Route path="mocks" element={<div className="panel sunken"><h3>Mock Tests — placeholder</h3><p>Phase 3 feature</p></div>} />
          </Route>
          
          {/* Redirect unknown routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Placeholder pages
function AdminOverview() {
  return (
    <>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Company statistics and action items.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="panel sunken"><h3>Live Tests</h3><p style={{ fontSize: 28, marginTop: 8 }}>-</p></div>
        <div className="panel sunken"><h3>Candidates</h3><p style={{ fontSize: 28, marginTop: 8 }}>-</p></div>
        <div className="panel sunken"><h3>Awaiting Review</h3><p style={{ fontSize: 28, marginTop: 8 }}>-</p></div>
        <div className="panel sunken"><h3>Average Score</h3><p style={{ fontSize: 28, marginTop: 8 }}>-</p></div>
      </div>
    </>
  );
}

function CandidateHome() {
  return (
    <>
      <div className="page-header">
        <h1>Candidate Portal</h1>
        <p>Your tests and progress.</p>
      </div>
      <div className="panel sunken" style={{ padding: 24, textAlign: 'center' }}>
        <h3>No active tests found</h3>
        <p style={{ color: 'var(--muted-text)', marginTop: 8 }}>No tests are currently available for you.</p>
      </div>
    </>
  );
}
