import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import PublicChargePage from '../pages/PublicCharge';

vi.mock('axios');
const mockedAxios = axios as any;

vi.mock('uuid', () => ({ v4: () => 'mock-uuid-v4' }));

function renderPage(linkId = 'link-uuid-1') {
  return render(
    <MemoryRouter initialEntries={[`/pay/${linkId}`]}>
      <Routes>
        <Route path="/pay/:linkId" element={<PublicChargePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get = vi.fn().mockResolvedValue({
    data: { description: 'Product X', amount: 19990 },
  });
});

describe('PublicChargePage', () => {
  it('renders form with link info', async () => {
    render(
      <MemoryRouter initialEntries={['/pay/link-uuid-1']}>
        <Routes>
          <Route path="/pay/:linkId" element={<PublicChargePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Seu nome')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('00000000000')).toBeInTheDocument();
    });
  });

  it('submits form with Idempotency-Key header', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { transaction_id: 'tx-abc', status: 'pending', amount: 19990, billing_link_id: 'link-uuid-1' },
    });

    renderPage();

    await waitFor(() => screen.getByPlaceholderText('Seu nome'));

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByPlaceholderText('00000000000'), { target: { value: '12345678901' } });
    fireEvent.click(screen.getByText('Pagar'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/v1/public/charge/link-uuid-1',
        { name: 'John Doe', cpf: '12345678901' },
        { headers: { 'Idempotency-Key': 'mock-uuid-v4' } }
      );
    });
  });

  it('shows success screen on 201', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { transaction_id: 'tx-success', status: 'pending', amount: 19990, billing_link_id: 'link-uuid-1' },
    });

    renderPage();
    await waitFor(() => screen.getByPlaceholderText('Seu nome'));

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('00000000000'), { target: { value: '98765432100' } });
    fireEvent.click(screen.getByText('Pagar'));

    await waitFor(() => {
      expect(screen.getByText('Pagamento enviado!')).toBeInTheDocument();
    });
  });

  it('shows duplicate screen on 409', async () => {
    mockedAxios.post = vi.fn().mockRejectedValue({
      response: { status: 409, data: { transaction_id: 'tx-existing' } },
    });

    renderPage();
    await waitFor(() => screen.getByPlaceholderText('Seu nome'));

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('00000000000'), { target: { value: '11122233344' } });
    fireEvent.click(screen.getByText('Pagar'));

    await waitFor(() => {
      expect(screen.getByText('Pagamento ja processado')).toBeInTheDocument();
    });
  });

  it('shows rate limit screen on 429', async () => {
    mockedAxios.post = vi.fn().mockRejectedValue({
      response: { status: 429, data: { error: 'rate_limit_exceeded' } },
    });

    renderPage();
    await waitFor(() => screen.getByPlaceholderText('Seu nome'));

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Carol' } });
    fireEvent.change(screen.getByPlaceholderText('00000000000'), { target: { value: '55566677788' } });
    fireEvent.click(screen.getByText('Pagar'));

    await waitFor(() => {
      expect(screen.getByText('Muitas tentativas')).toBeInTheDocument();
    });
  });
});
