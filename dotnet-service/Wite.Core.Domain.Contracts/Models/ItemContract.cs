using System.ComponentModel.DataAnnotations;
using Wite.Core.Domain.Contracts.Interfaces;

namespace Wite.Core.Domain.Contracts.Models;

public record ItemContract : IContract
{
    [Required]
    public required Guid Id { get; init; }

    [Required]
    public required string Name { get; init; }

    public string? Description { get; init; }

    [Required, Range(1, int.MaxValue)]
    public required int Quantity { get; init; }

    [Required, Range(1, int.MaxValue)]
    public required int UnitPrice { get; init; }

    public int TotalAmount => Quantity * UnitPrice;
}
