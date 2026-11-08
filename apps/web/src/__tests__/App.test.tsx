import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { AuthProvider } from '../contexts/AuthContext';

// Mock fetch globally
global.fetch = vi.fn();

describe('App', () => {
  it('renders login page when unauthenticated', () => {
    const { container } = render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );
    // Should have at least one auth container (StrictMode renders twice)
    expect(container.querySelectorAll('.auth-container').length).toBeGreaterThan(0);
  });

  it('shows title on login page', () => {
    const { container } = render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );
    // Check for Signal heading (may appear multiple times due to StrictMode)
    const headings = container.querySelectorAll('h1');
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].textContent).toBe('Signal');
  });
});
