import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { formatCurrency } from '../../lib/format';

interface LinkInfo {
  description: string;
  amount: number;
}

type ChargeState = 'idle' | 'loading' | 'success' | 'duplicate' | 'rate_limited' | 'error';

export default function PublicChargePage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [linkError, setLinkError] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [state, setState] = useState<ChargeState>('idle');
  const [transactionId, setTransactionId] = useState('');

  useEffect(() => {
    if (!linkId) return;
    axios.get(`/v1/billing-links/public-info/${linkId}`)
      .then((res) => setLinkInfo(res.data))
      .catch(() => setLinkError('Link de pagamento nao encontrado ou inativo.'));
  }, [linkId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    const idempotencyKey = uuidv4();

    try {
      const res = await axios.post(
        `/v1/public/charge/${linkId}`,
        { name, cpf },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );

      if (res.data?.idempotent) {
        setState('duplicate');
        setTransactionId(res.data.transaction_id);
        return;
      }

      setTransactionId(res.data.transaction_id);
      setState('success');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setTransactionId(err.response.data.transaction_id ?? '');
        setState('duplicate');
      } else if (status === 429) {
        setState('rate_limited');
      } else if (status === 404) {
        setLinkError('Link de pagamento nao encontrado ou inativo.');
        setState('idle');
      } else {
        setState('error');
      }
    }
  }

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-sm w-full text-center">
          <p className="text-red-600 font-medium">{linkError}</p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg border border-green-200 p-8 max-w-sm w-full text-center">
          <p className="text-green-700 text-xl font-bold mb-2">Pagamento enviado!</p>
          <p className="text-gray-500 text-sm">ID da transacao: <span className="font-mono text-xs">{transactionId}</span></p>
        </div>
      </div>
    );
  }

  if (state === 'duplicate') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg border border-yellow-200 p-8 max-w-sm w-full text-center">
          <p className="text-yellow-700 font-bold mb-2">Pagamento ja processado</p>
          <p className="text-gray-500 text-sm">Sua solicitacao ja foi recebida anteriormente.</p>
          {transactionId && <p className="text-gray-400 text-xs mt-1">ID: {transactionId}</p>}
        </div>
      </div>
    );
  }

  if (state === 'rate_limited') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg border border-orange-200 p-8 max-w-sm w-full text-center">
          <p className="text-orange-700 font-bold mb-2">Muitas tentativas</p>
          <p className="text-gray-500 text-sm">Aguarde 60 segundos e tente novamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-sm w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Pagamento</h1>
        {linkInfo && (
          <div className="mb-4">
            <p className="text-gray-600 text-sm">{linkInfo.description}</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(linkInfo.amount)}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, ''))}
              required
              maxLength={11}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="00000000000"
            />
          </div>
          {state === 'error' && (
            <p className="text-red-600 text-sm">Erro ao processar pagamento. Tente novamente.</p>
          )}
          <button
            type="submit"
            disabled={state === 'loading'}
            className="w-full bg-brand-600 text-white py-2 rounded font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {state === 'loading' ? 'Processando...' : 'Pagar'}
          </button>
        </form>
      </div>
    </div>
  );
}
