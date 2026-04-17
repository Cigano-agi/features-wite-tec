# WIA-204 — Core .NET: Domain Contracts

**Tipo:** Epic  
**Status:** Pendente  
**Jira:** https://witegroup.atlassian.net/browse/WIA-204

---

## Objetivo

Criar a biblioteca .NET `Wite.Core.Domain.Contracts` com todos os contratos de domínio compartilhados entre os serviços da plataforma WiteTec. Esta biblioteca é a fundação de todo o trabalho posterior — nenhum outro epic pode ser iniciado sem ela.

---

## Por que este epic é a fundação

Atualmente cada serviço .NET define seus próprios tipos para `Transaction`, `Customer`, status e respostas de API. Isso gera:

- Duplicação de código entre serviços
- Inconsistências de serialização (camelCase vs snake_case, valores de enum divergentes)
- Impossibilidade de compartilhar lógica de validação entre projetos

A biblioteca de contratos resolve isso definindo os tipos uma única vez, em um projeto sem dependências de negócio, referenciado por todos os demais.

---

## Estrutura do Projeto

```
Wite.Core.Domain.Contracts/
├── Wite.Core.Domain.Contracts.csproj
├── Interfaces/
│   ├── IContract.cs          # Marker interface
│   ├── IDomainEvent.cs
│   └── UniqueId.cs           # Value object para IDs
├── Models/
│   ├── TransactionContract.cs
│   ├── CustomerContract.cs
│   ├── ItemContract.cs
│   ├── IdempotencyContract.cs
│   ├── ApiResponseContract.cs
│   └── ErrorResponseContract.cs
└── Enums/
    ├── TransactionStatus.cs
    └── PaymentMethodType.cs
```

**Dependências do projeto:**
- `System.Text.Json` (serialização)
- Sem dependências de ORM, HTTP ou framework de aplicação

---

## Subtasks

### WIA-208 — Criar projeto `Wite.Core.Domain.Contracts`

**Deve ser executado primeiro.**

Criar o projeto .NET class library e estabelecer a estrutura base.

**Escopo:**

- Criar `Wite.Core.Domain.Contracts` como .NET class library (`.csproj`)
- Criar pastas: `Models/`, `Enums/`, `Interfaces/`
- Instalar: `System.Text.Json`
- Implementar contratos base:

```csharp
// Interfaces/IContract.cs
public interface IContract { }

// Interfaces/IDomainEvent.cs
public interface IDomainEvent
{
    Guid EventId { get; }
    DateTime OccurredAt { get; }
    string CorrelationId { get; }
}

// Interfaces/UniqueId.cs
public record UniqueId(Guid Value)
{
    public static UniqueId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString();
}
```

**Critérios de aceitação:**
- [ ] Projeto compila sem warnings
- [ ] Referenciável por outros projetos .NET da solução
- [ ] Sem dependências de ORM ou framework de aplicação

---

### WIA-205 — Contratos de Entidades

**Depende de:** WIA-208

Definir os contratos imutáveis para as entidades de domínio principais.

**Contratos a criar:**

```csharp
// Models/TransactionContract.cs
public record TransactionContract : IContract
{
    public required Guid Id { get; init; }
    public required string ExternalId { get; init; }
    public required long Amount { get; init; }           // centavos
    public required string Currency { get; init; }       // ex: "BRL"
    public required DateTime CreatedAt { get; init; }
    public required DateTime UpdatedAt { get; init; }
    public required Guid CustomerId { get; init; }
    public required Guid PaymentMethodId { get; init; }
    public required TransactionStatus StatusId { get; init; }
    public Guid? BillingLinkId { get; init; }            // nullable — só quando originada de link
    public required IReadOnlyList<ItemContract> Items { get; init; }
}

// Models/CustomerContract.cs
public record CustomerContract : IContract
{
    public required Guid Id { get; init; }
    public required string ExternalId { get; init; }
    public required string Name { get; init; }
    public required string Email { get; init; }
    public required string Document { get; init; }       // CPF ou CNPJ — nunca logar
}

// Models/ItemContract.cs
public record ItemContract : IContract
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required int Quantity { get; init; }
    public required long UnitPrice { get; init; }        // centavos
    public required long TotalAmount { get; init; }      // centavos
}
```

**Regras:**
- Todos os contratos são `record` com propriedades `init-only` — imutáveis por design
- `CustomerContract.Document` é PII — nunca deve aparecer em logs
- `TransactionContract.BillingLinkId` é nullable para compatibilidade com transações não originadas de links

**Critérios de aceitação:**
- [ ] Contratos compilam e são serializáveis com `System.Text.Json`
- [ ] Nenhuma propriedade mutável (sem `set`)
- [ ] Revisão de PII: `Document`, `Name`, `Email` marcados internamente como sensíveis

---

### WIA-206 — Enums de Domínio

**Depende de:** WIA-208

Definir os enums compartilhados usados em toda a plataforma.

**Enums a criar:**

```csharp
// Enums/TransactionStatus.cs
public enum TransactionStatus
{
    [Description("Pendente")]
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

// Enums/PaymentMethodType.cs
public enum PaymentMethodType
{
    [Description("Cartão de Crédito")]
    CreditCard = 1,

    [Description("Cartão de Débito")]
    DebitCard = 2,

    [Description("PIX")]
    Pix = 3,

    [Description("Boleto")]
    Boleto = 4,

    [Description("Carteira Digital")]
    Wallet = 5
}
```

**Regras:**
- Valores inteiros explícitos e **estáveis** — nunca reordenar membros existentes
- Atributo `[Description]` obrigatório em todos os membros para exibição em UIs e logs
- Adicionar novos membros sempre ao final, com próximo valor inteiro disponível

**Mapping para WIA-272 (Billing Links):**

| Métrica de dashboard | Status que conta |
|----------------------|-----------------|
| `total_approved` | `Approved` (2) e `Settled` (7) |
| `total_pending` | `Pending` (1) |

**Critérios de aceitação:**
- [ ] Enums compilam e os valores inteiros são estáveis
- [ ] `[Description]` presente em todos os membros
- [ ] Mapping `total_approved` / `total_pending` documentado e alinhado com WIA-275

---

### WIA-207 — Idempotência e Contratos de Resposta de API

**Depende de:** WIA-208

Definir os contratos de infraestrutura que garantem idempotência e padronizam as respostas da API.

**Contratos a criar:**

```csharp
// Models/IdempotencyContract.cs
public record IdempotencyContract : IContract
{
    public required string Key { get; init; }
    public required IdempotencyStatus Status { get; init; }
    public string? ResponsePayload { get; init; }        // JSON serializado da resposta original
    public required DateTime CreatedAt { get; init; }
    public required DateTime ExpiresAt { get; init; }
    public required string CorrelationId { get; init; }
}

public enum IdempotencyStatus
{
    Processing = 1,
    Completed = 2,
    Failed = 3
}

// Models/ApiResponseContract.cs
public record ApiResponseContract<T> : IContract
{
    public required bool Success { get; init; }
    public required string Message { get; init; }
    public T? Data { get; init; }
    public required string CorrelationId { get; init; }
}

// Models/ErrorResponseContract.cs
public record ErrorResponseContract : IContract
{
    public required string ErrorCode { get; init; }      // ex: "billing_link_not_found"
    public required string Message { get; init; }
    public IReadOnlyList<string> Details { get; init; } = [];
    public required DateTime Timestamp { get; init; }
    public required string CorrelationId { get; init; }
    // NUNCA incluir campos de PII (name, cpf, document) neste contrato
}
```

**Regras:**
- `CorrelationId` obrigatório em TODOS os contratos de resposta — rastreabilidade end-to-end
- `ErrorResponseContract` não pode conter campos de PII — PiiSanitizer deve ser aplicado antes de popular o contrato
- `IdempotencyContract.ResponsePayload` é o JSON da resposta original — permite replay sem reprocessar

**Critérios de aceitação:**
- [ ] Contratos compilam e são serializáveis
- [ ] `CorrelationId` presente em `ApiResponseContract<T>` e `ErrorResponseContract`
- [ ] Revisão: nenhum campo de PII em `ErrorResponseContract`

---

## Dependências

- Nenhuma dependência externa — este epic é a fundação

## Ordem de implementação dentro do epic

```
WIA-208 (estrutura do projeto)
  → WIA-205 (entidades) — paralelo com WIA-206 e WIA-207
  → WIA-206 (enums) — paralelo com WIA-205 e WIA-207
  → WIA-207 (idempotência/resposta) — paralelo com WIA-205 e WIA-206
```

WIA-205, WIA-206 e WIA-207 não têm dependência entre si — podem ser desenvolvidos em paralelo após WIA-208.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Valores de enum alterados após outros serviços já usarem | Nunca reordenar — apenas adicionar ao final |
| PII incluído em `ErrorResponseContract` por descuido | Code review obrigatório; lint rule para campos suspeitos |
| Versão de `System.Text.Json` incompatível com .NET target dos serviços consumidores | Alinhar versão do SDK antes de publicar |
