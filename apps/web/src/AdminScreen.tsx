import React from 'react';

export function AdminScreen() {
  return (
    <div className="panel" style={{ padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)' }}>Overview</h1>
      <p>Company statistics and action items.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="panel" style={{ padding: 16 }}><h3>Live Tests</h3></div>
        <div className="panel" style={{ padding: 16 }}><h3>Waiting for Review</h3></div>
      </div>
    </div>
  );
}