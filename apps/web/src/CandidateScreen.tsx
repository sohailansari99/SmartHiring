import React from 'react';

export function CandidateScreen() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)' }}>Candidate Portal</h1>
      <div className="panel" style={{ padding: 16, marginTop: 16 }}>
        <h3>Tests For You</h3>
        <p>No active tests match your verified status.</p>
      </div>
    </div>
  );
}