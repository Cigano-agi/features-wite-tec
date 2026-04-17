using System.ComponentModel.DataAnnotations;
using Wite.Core.Domain.Contracts.Interfaces;

namespace Wite.Core.Domain.Contracts.Models;

public enum IdempotencyStatus
{
    Processing = 1,
    Completed = 2,
    Failed = 3
}

public record IdempotencyContract : IContract
{
    [Required]
    public required string Key { get; init; }

    [Required]
    public required IdempotencyStatus Status { get; init; }

    public string? ResponsePayload { get; init; }

    [Required]
    public required DateTime CreatedAt { get; init; }

    [Required]
    public required DateTime ExpiresAt { get; init; }
}
