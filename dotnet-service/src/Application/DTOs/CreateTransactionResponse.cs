namespace WitetecBillingService.Application.DTOs;

public record CreateTransactionResponse(
    Guid TransactionId,
    string Status,
    int Amount
);
