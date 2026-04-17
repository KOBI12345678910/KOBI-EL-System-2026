import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders without crashing', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByTestId('status-badge')).toBeDefined();
  });

  it('shows green color for "approved" status', () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByTestId('status-badge');
    const style = badge.getAttribute('style') ?? '';
    // The approved color is #3DCC91
    expect(style).toContain('#3DCC91');
  });

  it('renders the correct Hebrew label for "approved"', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('אושר')).toBeDefined();
  });

  it('renders the correct Hebrew label for "pending"', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('ממתין')).toBeDefined();
  });

  it('falls back gracefully for an unknown status', () => {
    render(<StatusBadge status="unknown-xyz" />);
    expect(screen.getByText('unknown-xyz')).toBeDefined();
  });
});
