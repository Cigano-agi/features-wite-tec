namespace Wite.Core.Domain.Contracts.Interfaces;

public interface IDomainEvent
{
    Guid EventId { get; }
    DateTime OccurredAt { get; }
    string EventType { get; }
}
