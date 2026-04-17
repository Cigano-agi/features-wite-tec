using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using WitetecBillingService.Application.DTOs;
using WitetecBillingService.Application.Interfaces;
using WitetecBillingService.Application.UseCases;
using WitetecBillingService.Domain.Entities;
using WitetecBillingService.Domain.Exceptions;
using Xunit;

namespace WitetecBillingService.Tests.UseCases;

public class CreateTransactionUseCaseTests
{
    private readonly Mock<ITransactionRepository> _repoMock = new();
    private readonly Mock<ILogger<CreateTransactionUseCase>> _loggerMock = new();
    private readonly CreateTransactionUseCase _useCase;

    public CreateTransactionUseCaseTests()
    {
        _useCase = new CreateTransactionUseCase(_repoMock.Object, _loggerMock.Object);
    }

    private static CreateTransactionRequest BuildRequest(Guid? billingLinkId = null) =>
        new(
            BillingLinkId: billingLinkId ?? Guid.NewGuid(),
            Amount: 10000,
            PayerName: "John Doe",
            PayerCpf: "12345678901",
            PayerEmail: "noreply@witetec.com",
            PayerPhone: "+5511999999999",
            Metadata: new Dictionary<string, string> { ["source"] = "public_charge" }
        );

    [Fact]
    public async Task Execute_CreatesPendingTransaction()
    {
        var request = BuildRequest();
        _repoMock.Setup(r => r.SaveAsync(It.IsAny<Transaction>(), default)).Returns(Task.CompletedTask);

        var result = await _useCase.ExecuteAsync(request, "corr-1");

        result.Status.Should().Be("pending");
        result.Amount.Should().Be(10000);
        result.TransactionId.Should().NotBeEmpty();
        _repoMock.Verify(r => r.SaveAsync(It.IsAny<Transaction>(), default), Times.Once);
    }

    [Fact]
    public async Task Transaction_CanTransitionToApproved()
    {
        var tx = Transaction.Create(Guid.NewGuid(), 5000, "Jane", "98765", "e@e.com", "+55", new());

        var act = () => tx.Approve();

        act.Should().NotThrow();
        tx.Status.Should().Be(Domain.Enums.TransactionStatus.Approved);
    }

    [Fact]
    public async Task Transaction_ApprovedToApproved_ThrowsInvalidTransition()
    {
        var tx = Transaction.Create(Guid.NewGuid(), 5000, "Jane", "98765", "e@e.com", "+55", new());
        tx.Approve();

        var act = () => tx.Approve();

        act.Should().Throw<InvalidTransactionTransitionException>();
    }

    [Fact]
    public async Task Transaction_ApprovedToFailed_ThrowsInvalidTransition()
    {
        var tx = Transaction.Create(Guid.NewGuid(), 5000, "Jane", "98765", "e@e.com", "+55", new());
        tx.Approve();

        var act = () => tx.Fail();

        act.Should().Throw<InvalidTransactionTransitionException>();
    }

    [Fact]
    public async Task Transaction_PendingToFailed_Succeeds()
    {
        var tx = Transaction.Create(Guid.NewGuid(), 5000, "Jane", "98765", "e@e.com", "+55", new());

        var act = () => tx.Fail();

        act.Should().NotThrow();
        tx.Status.Should().Be(Domain.Enums.TransactionStatus.Failed);
    }
}
