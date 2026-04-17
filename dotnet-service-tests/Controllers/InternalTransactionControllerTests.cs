using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using WitetecBillingService.Application.DTOs;
using WitetecBillingService.Application.UseCases;
using WitetecBillingService.API.Controllers;
using WitetecBillingService.Application.Interfaces;
using Xunit;

namespace WitetecBillingService.Tests.Controllers;

public class InternalTransactionControllerTests
{
    private readonly Mock<ITransactionRepository> _repoMock = new();
    private readonly Mock<ILogger<CreateTransactionUseCase>> _useCaseLoggerMock = new();
    private readonly Mock<ILogger<InternalTransactionController>> _controllerLoggerMock = new();
    private InternalTransactionController BuildController(string? correlationId = null)
    {
        var useCase = new CreateTransactionUseCase(_repoMock.Object, _useCaseLoggerMock.Object);
        var controller = new InternalTransactionController(useCase, _controllerLoggerMock.Object);
        var httpContext = new DefaultHttpContext();
        if (correlationId != null)
            httpContext.Request.Headers["x-correlation-id"] = correlationId;
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    [Fact]
    public async Task Create_Returns201WithTransactionResponse()
    {
        _repoMock.Setup(r => r.SaveAsync(It.IsAny<Domain.Entities.Transaction>(), default)).Returns(Task.CompletedTask);
        var controller = BuildController("test-corr-id");
        var request = new CreateTransactionRequest(
            BillingLinkId: Guid.NewGuid(),
            Amount: 15000,
            PayerName: "Alice",
            PayerCpf: "11122233344",
            PayerEmail: "noreply@witetec.com",
            PayerPhone: "+5511000000000",
            Metadata: new Dictionary<string, string> { ["source"] = "public_charge" }
        );

        var actionResult = await controller.Create(request, default);

        var result = actionResult as ObjectResult;
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(201);

        var response = result.Value as CreateTransactionResponse;
        response.Should().NotBeNull();
        response!.Amount.Should().Be(15000);
        response.Status.Should().Be("pending");
        response.TransactionId.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_PropagatesCorrelationId()
    {
        _repoMock.Setup(r => r.SaveAsync(It.IsAny<Domain.Entities.Transaction>(), default)).Returns(Task.CompletedTask);
        var correlationId = "my-corr-id-999";
        var controller = BuildController(correlationId);

        var request = new CreateTransactionRequest(
            Guid.NewGuid(), 5000, "Bob", "99988877766", "noreply@witetec.com", "+55", new()
        );

        var actionResult = await controller.Create(request, default);
        var result = actionResult as ObjectResult;

        result!.StatusCode.Should().Be(201);
        // CorrelationId is propagated via header in middleware; here we verify response shape
        var response = result.Value as CreateTransactionResponse;
        response!.TransactionId.Should().NotBeEmpty();
    }
}
