using WitetecBillingService.Domain.Enums;
using WitetecBillingService.Domain.Exceptions;

namespace WitetecBillingService.Domain.Entities;

public class Transaction
{
    public Guid TransactionId { get; private set; }
    public Guid BillingLinkId { get; private set; }
    public int Amount { get; private set; }
    public string PayerName { get; private set; } = string.Empty;
    public string PayerCpf { get; private set; } = string.Empty;
    public string PayerEmail { get; private set; } = string.Empty;
    public string PayerPhone { get; private set; } = string.Empty;
    public TransactionStatus Status { get; private set; }
    public Dictionary<string, string> Metadata { get; private set; } = new();
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Transaction() { }

    public static Transaction Create(
        Guid billingLinkId,
        int amount,
        string payerName,
        string payerCpf,
        string payerEmail,
        string payerPhone,
        Dictionary<string, string> metadata)
    {
        return new Transaction
        {
            TransactionId = Guid.NewGuid(),
            BillingLinkId = billingLinkId,
            Amount = amount,
            PayerName = payerName,
            PayerCpf = payerCpf,
            PayerEmail = payerEmail,
            PayerPhone = payerPhone,
            Status = TransactionStatus.Pending,
            Metadata = metadata,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
    }

    public void Approve()
    {
        if (Status != TransactionStatus.Pending)
            throw new InvalidTransactionTransitionException(Status, TransactionStatus.Approved);
        Status = TransactionStatus.Approved;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Fail()
    {
        if (Status != TransactionStatus.Pending)
            throw new InvalidTransactionTransitionException(Status, TransactionStatus.Failed);
        Status = TransactionStatus.Failed;
        UpdatedAt = DateTime.UtcNow;
    }
}
