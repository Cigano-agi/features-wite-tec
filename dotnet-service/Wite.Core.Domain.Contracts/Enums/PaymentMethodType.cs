using System.ComponentModel;

namespace Wite.Core.Domain.Contracts.Enums;

public enum PaymentMethodType
{
    [Description("Cartão de crédito")]
    CreditCard = 1,

    [Description("Cartão de débito")]
    DebitCard = 2,

    [Description("PIX")]
    Pix = 3,

    [Description("Boleto")]
    Boleto = 4,

    [Description("Carteira digital")]
    Wallet = 5
}
