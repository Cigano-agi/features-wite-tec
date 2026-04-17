using WitetecBillingService.Domain.Entities;

namespace WitetecBillingService.Application.Interfaces;

public interface ITransactionRepository
{
    Task SaveAsync(Transaction transaction, CancellationToken ct = default);
    Task<Transaction?> FindByIdAsync(Guid transactionId, CancellationToken ct = default);
}
