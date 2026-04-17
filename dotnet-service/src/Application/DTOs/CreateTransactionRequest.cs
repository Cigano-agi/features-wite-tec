namespace WitetecBillingService.Application.DTOs;

public record CreateTransactionRequest(
    Guid BillingLinkId,
    int Amount,
    string PayerName,
    string PayerCpf,
    string PayerEmail,
    string PayerPhone,
    Dictionary<string, string> Metadata
);
