using Microsoft.EntityFrameworkCore;
using WitetecBillingService.Application.Interfaces;
using WitetecBillingService.Domain.Entities;

namespace WitetecBillingService.Infrastructure.Persistence;

public class EfTransactionRepository : ITransactionRepository
{
    private readonly BillingDbContext _db;

    public EfTransactionRepository(BillingDbContext db) => _db = db;

    public async Task SaveAsync(Transaction transaction, CancellationToken ct = default)
    {
        var tracked = _db.ChangeTracker.Entries<Transaction>()
            .FirstOrDefault(e => e.Entity.TransactionId == transaction.TransactionId);

        if (tracked is not null)
        {
            tracked.State = EntityState.Modified;
        }
        else
        {
            var exists = await _db.Transactions
                .AsNoTracking()
                .AnyAsync(t => t.TransactionId == transaction.TransactionId, ct);

            if (exists)
                _db.Transactions.Update(transaction);
            else
                await _db.Transactions.AddAsync(transaction, ct);
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<Transaction?> FindByIdAsync(Guid transactionId, CancellationToken ct = default)
    {
        return await _db.Transactions.FindAsync([transactionId], ct);
    }
}
