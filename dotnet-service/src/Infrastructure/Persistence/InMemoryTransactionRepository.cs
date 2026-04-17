using System.Collections.Concurrent;
using WitetecBillingService.Application.Interfaces;
using WitetecBillingService.Domain.Entities;

namespace WitetecBillingService.Infrastructure.Persistence;

/// <summary>
/// In-memory implementation for local dev / tests.
/// TODO: TECH_LEAD_REVIEW — Replace with PostgreSQL EF Core implementation before production.
/// </summary>
public class InMemoryTransactionRepository : ITransactionRepository
{
    private readonly ConcurrentDictionary<Guid, Transaction> _store = new();

    public Task SaveAsync(Transaction transaction, CancellationToken ct = default)
    {
        _store[transaction.TransactionId] = transaction;
        return Task.CompletedTask;
    }

    public Task<Transaction?> FindByIdAsync(Guid transactionId, CancellationToken ct = default)
    {
        _store.TryGetValue(transactionId, out var tx);
        return Task.FromResult(tx);
    }
}
