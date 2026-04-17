using Wite.Core.Domain.Contracts.Interfaces;

namespace Wite.Core.Domain.Contracts.Models;

public record ApiResponseContract<T> : IContract
{
    public bool Success { get; init; }
    public string? Message { get; init; }
    public T? Data { get; init; }

    public static ApiResponseContract<T> Ok(T data, string? message = null) =>
        new() { Success = true, Data = data, Message = message };

    public static ApiResponseContract<T> Fail(string message) =>
        new() { Success = false, Message = message };
}

public record ErrorResponseContract : IContract
{
    public required string ErrorCode { get; init; }
    public required string Message { get; init; }
    public IReadOnlyList<string> Details { get; init; } = [];
    public required DateTime Timestamp { get; init; }
    public string? CorrelationId { get; init; }
}
