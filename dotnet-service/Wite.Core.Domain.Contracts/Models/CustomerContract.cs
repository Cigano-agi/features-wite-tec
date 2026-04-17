using System.ComponentModel.DataAnnotations;
using Wite.Core.Domain.Contracts.Interfaces;

namespace Wite.Core.Domain.Contracts.Models;

public record CustomerContract : IContract
{
    [Required]
    public required Guid Id { get; init; }

    public string? ExternalId { get; init; }

    [Required]
    public required string Name { get; init; }

    [Required, EmailAddress]
    public required string Email { get; init; }

    [Required]
    public required string Document { get; init; }
}
