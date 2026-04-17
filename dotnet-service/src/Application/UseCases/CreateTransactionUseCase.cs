using WitetecBillingService.Application.DTOs;
using WitetecBillingService.Application.Interfaces;
using WitetecBillingService.Domain.Entities;

namespace WitetecBillingService.Application.UseCases;

public class CreateTransactionUseCase
{
    private readonly ITransactionRepository _repository;
    private readonly ILogger<CreateTransactionUseCase> _logger;

    public CreateTransactionUseCase(ITransactionRepository repository, ILogger<CreateTransactionUseCase> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<CreateTransactionResponse> ExecuteAsync(CreateTransactionRequest request, string correlationId, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "Creating transaction billingLinkId={BillingLinkId} correlationId={CorrelationId} eventType=transaction_created",
            request.BillingLinkId,
            correlationId
        );

        var transaction = Transaction.Create(
            request.BillingLinkId,
            request.Amount,
            request.PayerName,
            request.PayerCpf,
            request.PayerEmail,
            request.PayerPhone,
            request.Metadata
        );

        await _repository.SaveAsync(transaction, ct);

        _logger.LogInformation(
            "Transaction saved transactionId={TransactionId} status={Status} correlationId={CorrelationId}",
            transaction.TransactionId,
            transaction.Status,
            correlationId
        );

        return new CreateTransactionResponse(transaction.TransactionId, transaction.Status.ToString().ToLower(), transaction.Amount);
    }
}
