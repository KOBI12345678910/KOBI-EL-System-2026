/**
 * Tests for the StatusTag component (techno-kol-ops equivalent of StatusBadge).
 * StatusTag renders colored Hebrew labels for order/job statuses.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusTag } from '../components/StatusTag';

describe('StatusTag (status badge)', () => {
  it('renders without crashing for status="ready" (active/ready state)', () => {
    render(<StatusTag status="ready" />);
    // Should render the Hebrew label for ready
    expect(screen.getByText('מוכן')).toBeDefined();
  });

  it('shows green color for "ready" (active) status', () => {
    const { container } = render(<StatusTag status="ready" />);
    const span = container.querySelector('span');
    const style = span?.getAttribute('style') ?? '';
    // The ready color token is #3DCC91 (green)
    expect(style).toContain('#3DCC91');
  });

  it('renders without crashing for status="cancelled" (overdue/red state)', () => {
    render(<StatusTag status="cancelled" />);
    expect(screen.getByText('בוטל')).toBeDefined();
  });

  it('shows red/warning color for "cancelled" status', () => {
    const { container } = render(<StatusTag status="cancelled" />);
    const span = container.querySelector('span');
    const style = span?.getAttribute('style') ?? '';
    // The cancelled color token is #FC8585 (red)
    expect(style).toContain('#FC8585');
  });

  it('renders "production" status without crashing', () => {
    render(<StatusTag status="production" />);
    expect(screen.getByText('ייצור')).toBeDefined();
  });

  it('falls back to the raw status string for unknown statuses', () => {
    render(<StatusTag status="unknown-status" />);
    expect(screen.getByText('unknown-status')).toBeDefined();
  });
});
