using System.ComponentModel;

namespace Wite.Core.Domain.Contracts.Enums;

public enum TransactionStatus
{
    [Description("Aguardando processamento")]
    Pending = 1,

    [Description("Aprovada")]
    Approved = 2,

    [Description("Negada")]
    Denied = 3,

    [Description("Estornada")]
    Refunded = 4,

    [Description("Cancelada")]
    Canceled = 5,

    [Description("Chargeback")]
    Chargeback = 6,

    [Description("Liquidada")]
    Settled = 7
}
