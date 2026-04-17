using System.ComponentModel.DataAnnotations;
using Wite.Core.Domain.Contracts.Enums;
using Wite.Core.Domain.Contracts.Interfaces;

namespace Wite.Core.Domain.Contracts.Models;

public record TransactionContract : IContract
{
    [Required]
    public required Guid Id { get; init; }

    public string? ExternalId { get; init; }

    public string? ExternalRef { get; init; }

    public string? End2EndId { get; init; }

    [Required, Range(1, int.MaxValue)]
    public required int Amount { get; init; }

    [Required]
    public required string Currency { get; init; } = "BRL";

    [Required]
    public required TransactionStatus Status { get; init; }

    [Required]
    public required PaymentMethodType PaymentMethod { get; init; }

    [Required]
    public required Guid CustomerId { get; init; }

    public Guid? BillingLinkId { get; init; }

    public string? CorrelationId { get; init; }

    public IReadOnlyList<ItemContract> Items { get; init; } = [];

    [Required]
    public required DateTime CreatedAt { get; init; }

    public DateTime? UpdatedAt { get; init; }
}
