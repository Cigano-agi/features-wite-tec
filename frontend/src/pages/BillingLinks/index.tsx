import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { BillingLink, Metrics } from '../../lib/types';
import { formatCurrency, centsFromReais } from '../../lib/format';

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function MetricsPanel({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {[
        { label: 'Links ativos', value: metrics.active_links },
        { label: 'Aprovadas', value: metrics.total_approved },
        { label: 'Pendentes', value: metrics.total_pending },
      ].map(({ label, value }) => (
        <div key={label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default function BillingLinksPage() {
  const [links, setLinks] = useState<BillingLink[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const publicUrl = (id: string) => `${window.location.origin}/pay/${id}`;

  async function loadData() {
    const [linksRes, metricsRes] = await Promise.all([
      api.get<BillingLink[]>('/billing-links'),
      api.get<Metrics>('/billing-links/metrics'),
    ]);
    setLinks(linksRes.data);
    setMetrics(metricsRes.data);
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!amount || !description) return;
    setCreating(true);
    try {
      const cents = centsFromReais(amount);
      await api.post('/billing-links', { amount: cents, description });
      setAmount('');
      setDescription('');
      await loadData();
    } catch {
      setError('Erro ao criar link. Verifique os dados.');
    } finally {
      setCreating(false);
    }
  }

  async function handleInactivate(id: string) {
    await api.delete(`/billing-links/${id}`);
    await loadData();
  }

  async function handleCopy(id: string) {
    await navigator.clipboard.writeText(publicUrl(id));
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing Links</h1>

      {metrics && <MetricsPanel metrics={metrics} />}

      <form onSubmit={handleCreate} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-gray-700 mb-3">Novo link</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Valor (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 w-32 text-sm"
          />
          <input
            type="text"
            placeholder="Descricao"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </form>

      <div className="space-y-3">
        {links.map((link) => (
          <div key={link.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{link.description}</p>
              <p className="text-sm text-gray-500">{formatCurrency(link.amount)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={link.status} />
              {link.status === 'active' && (
                <>
                  <button
                    onClick={() => handleCopy(link.id)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {copied === link.id ? 'Copiado!' : 'Copiar URL'}
                  </button>
                  <button
                    onClick={() => handleInactivate(link.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Inativar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {links.length === 0 && <p className="text-gray-400 text-sm text-center py-6">Nenhum link criado ainda.</p>}
      </div>
    </div>
  );
}
