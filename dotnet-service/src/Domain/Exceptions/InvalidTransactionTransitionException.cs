using WitetecBillingService.Domain.Enums;

namespace WitetecBillingService.Domain.Exceptions;

public class InvalidTransactionTransitionException : Exception
{
    public InvalidTransactionTransitionException(TransactionStatus from, TransactionStatus to)
        : base($"Invalid transition: {from} -> {to}") { }
}
