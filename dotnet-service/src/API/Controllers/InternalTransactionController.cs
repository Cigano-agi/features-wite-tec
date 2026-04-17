using Microsoft.AspNetCore.Mvc;
using WitetecBillingService.Application.DTOs;
using WitetecBillingService.Application.UseCases;

namespace WitetecBillingService.API.Controllers;

[ApiController]
[Route("internal")]
public class InternalTransactionController : ControllerBase
{
    private readonly CreateTransactionUseCase _useCase;
    private readonly ILogger<InternalTransactionController> _logger;

    private const string CorrelationHeader = "x-correlation-id";

    public InternalTransactionController(CreateTransactionUseCase useCase, ILogger<InternalTransactionController> logger)
    {
        _useCase = useCase;
        _logger = logger;
    }

    [HttpPost("transactions")]
    [ProducesResponseType(typeof(CreateTransactionResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateTransactionRequest request, CancellationToken ct)
    {
        var correlationId = Request.Headers.TryGetValue(CorrelationHeader, out var v) ? v.ToString() : Guid.NewGuid().ToString();

        _logger.LogInformation(
            "Received internal transaction request billingLinkId={BillingLinkId} correlationId={CorrelationId} eventType=transaction_request_received",
            request.BillingLinkId,
            correlationId
        );

        var response = await _useCase.ExecuteAsync(request, correlationId, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }
}
