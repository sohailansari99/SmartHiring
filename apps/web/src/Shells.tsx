import React from 'react';

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <aside style={{ width: 240, borderRight: '1px solid var(--hairline)', padding: 16 }}>
        <h2 style={{ fontSize: 20, margin: '0 0 16px 0' }}>Signal</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href="/admin">Overview</a>
          <a href="/admin/tests">Tests</a>
          <a href="/admin/students">Students</a>
          <a href="/admin/company">Company</a>
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        {children}
      </main>
    </div>
  );
}

export function CandidateShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <header style={{ borderBottom: '1px solid var(--hairline)', padding: '16px 24px', display: 'flex', gap: 24 }}>
        <span style={{ fontWeight: 'bold' }}>Signal Candidate</span>
        <nav style={{ display: 'flex', gap: 16 }}>
          <a href="/candidate">Home</a>
          <a href="/candidate/practice">Practice</a>
          <a href="/candidate/mocks">Mock Tests</a>
        </nav>
      </header>
      <main style={{ padding: 24 }}>
        {children}
      </main>
    </div>
  );
}