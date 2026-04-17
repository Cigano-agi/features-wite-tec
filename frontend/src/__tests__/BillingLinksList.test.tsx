import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BillingLinksPage from '../pages/BillingLinks';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockLinks = [
  { id: 'link-1', seller_id: 'seller-1', amount: 10000, description: 'Product A', status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'link-2', seller_id: 'seller-1', amount: 5000, description: 'Product B', status: 'inactive', created_at: '2026-01-01', updated_at: '2026-01-01' },
];

const mockMetrics = { active_links: 1, total_approved: 3, total_pending: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/billing-links') return Promise.resolve({ data: mockLinks });
    if (url === '/billing-links/metrics') return Promise.resolve({ data: mockMetrics });
    return Promise.resolve({ data: {} });
  });
});

describe('BillingLinksPage', () => {
  it('renders billing links with status badges', async () => {
    render(<BillingLinksPage />);

    await waitFor(() => {
      expect(screen.getByText('Product A')).toBeInTheDocument();
      expect(screen.getByText('Product B')).toBeInTheDocument();
    });

    const activeBadges = screen.getAllByText('active');
    const inactiveBadges = screen.getAllByText('inactive');
    expect(activeBadges.length).toBeGreaterThan(0);
    expect(inactiveBadges.length).toBeGreaterThan(0);
  });

  it('renders metrics panel', async () => {
    render(<BillingLinksPage />);

    await waitFor(() => {
      expect(screen.getByText('Links ativos')).toBeInTheDocument();
      expect(screen.getByText('Aprovadas')).toBeInTheDocument();
      expect(screen.getByText('Pendentes')).toBeInTheDocument();
    });
  });

  it('calls inactivate service when inativar button is clicked', async () => {
    (api.delete as any).mockResolvedValue({});

    render(<BillingLinksPage />);

    await waitFor(() => screen.getByText('Product A'));

    const inativarBtn = screen.getByText('Inativar');
    fireEvent.click(inativarBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/billing-links/link-1');
    });
  });

  it('shows empty state when no links', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/billing-links') return Promise.resolve({ data: [] });
      if (url === '/billing-links/metrics') return Promise.resolve({ data: mockMetrics });
      return Promise.resolve({ data: {} });
    });

    render(<BillingLinksPage />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum link criado/)).toBeInTheDocument();
    });
  });
});
