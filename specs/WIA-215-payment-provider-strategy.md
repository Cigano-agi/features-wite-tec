# WIA-215 — Strategy Pattern para Provedores de Pagamento PIX

**Tipo:** Epic  
**Status:** Pendente  
**Depende de:** WIA-204  
**Jira:** https://witegroup.atlassian.net/browse/WIA-215

---

## Objetivo

Desacoplar o motor de transações da plataforma de qualquer PSP (Payment Service Provider) específico através do padrão Strategy. Trocar ou adicionar um provedor de pagamentos deve exigir apenas configuração — zero alteração de lógica de negócio.

---

## Arquitetura

```
CreateTransactionService
        │
        │ resolve por providerId
        ▼
  IProviderFactory
        │
        ├──► ProviderA : IPaymentProvider  (ex: Celcoin)
        ├──► ProviderB : IPaymentProvider  (ex: Asaas)
        └──► ProviderC : IPaymentProvider  (ex: PagSeguro)
                │
                │ Polly (retry + circuit breaker)
                ▼
           PSP externo (HTTP)
```

Todos os `IPaymentProvider` recebem e retornam os DTOs definidos neste epic. Nenhum dado específico de PSP (chaves, endpoints, formatos proprietários) vaza para fora da implementação concreta.

---

## Subtasks

### WIA-218 — Interfaces `IPaymentProvider`, `PaymentRequest`, `PaymentResponse`

**Deve ser executado primeiro.**

Definir o contrato público da abstração de provedor.

**Interfaces e DTOs:**

```csharp
// Interfaces/IPaymentProvider.cs
public interface IPaymentProvider
{
    string ProviderId { get; }

    Task<PaymentResponse> CreateChargeAsync(
        PaymentRequest request,
        CancellationToken ct = default);

    Task<PaymentResponse> GetStatusAsync(
        string externalRef,
        CancellationToken ct = default);

    Task<PaymentResponse> RefundAsync(
        string externalRef,
        long amountInCents,
        CancellationToken ct = default);
}

// DTOs/PaymentRequest.cs
public record PaymentRequest
{
    public required long Amount { get; init; }           // centavos
    public required string Currency { get; init; }       // "BRL"
    public Guid? BillingLinkId { get; init; }
    public required string PayerName { get; init; }      // PII — nunca logar
    public required string PayerDocument { get; init; }  // CPF/CNPJ — nunca logar
    public required PaymentMethodType PaymentMethod { get; init; }
    public required string CorrelationId { get; init; }
    public required string IdempotencyKey { get; init; }
}

// DTOs/PaymentResponse.cs
public record PaymentResponse
{
    public required string TransactionId { get; init; }
    public required string ExternalRef { get; init; }
    public required TransactionStatus Status { get; init; }
    public string? PixQrCode { get; init; }              // base64 da imagem QR
    public string? PixCopiaECola { get; init; }          // string de cópia e cola
    public DateTime? PixExpiresAt { get; init; }
    public required string CorrelationId { get; init; }
}
```

**Regras SOLID obrigatórias:**
- `IPaymentProvider` não pode expor tipos específicos de PSP (sem `CelcoinChargeDto`, etc.)
- `PaymentRequest.PayerDocument` e `PayerName` são PII — todas as implementações devem garantir que esses campos não apareçam em logs
- Implementações concretas ficam em projetos separados (ex: `Wite.Provider.Celcoin`) — nunca no projeto de domínio

**Critérios de aceitação:**
- [ ] Interface compila e é referenciável pelos outros projetos
- [ ] Nenhum tipo específico de PSP exposto na interface pública
- [ ] `CorrelationId` presente em `PaymentRequest` e `PaymentResponse`

---

### WIA-216 — `ProviderFactory`

**Depende de:** WIA-218

Implementar a factory responsável por resolver o `IPaymentProvider` correto em runtime.

**Interfaces e implementação:**

```csharp
// Interfaces/IProviderFactory.cs
public interface IProviderFactory
{
    IPaymentProvider GetProvider(string providerId);
}

// Infrastructure/ProviderFactory.cs
public sealed class ProviderFactory : IProviderFactory
{
    private readonly IServiceProvider _serviceProvider;

    public ProviderFactory(IServiceProvider serviceProvider)
        => _serviceProvider = serviceProvider;

    public IPaymentProvider GetProvider(string providerId)
    {
        var providers = _serviceProvider
            .GetServices<IPaymentProvider>();

        var provider = providers
            .FirstOrDefault(p => p.ProviderId == providerId);

        if (provider is null)
            throw new InvalidOperationException(
                $"No provider registered for id '{providerId}'");

        return provider;
    }
}
```

**Registro de DI (Program.cs):**

```csharp
// Cada implementação de provider registrada individualmente
builder.Services.AddScoped<IPaymentProvider, CelcoinProvider>();
builder.Services.AddScoped<IPaymentProvider, AsaasProvider>();

// Factory como Singleton — thread-safe via IServiceProvider
builder.Services.AddSingleton<IProviderFactory, ProviderFactory>();
```

**Resolução do providerId:**
- O `providerId` vem da configuração do seller (tabela `acquirer_configs` ou equivalente)
- `CreateTransactionService` consulta o acquirer ativo do seller e passa o `providerId` para a factory
- **Nunca hardcoded** — sellers diferentes podem usar providers diferentes

**Lifecycle:**
- `IPaymentProvider` registrado como `Scoped` (por requisição)
- `IProviderFactory` registrado como `Singleton` (thread-safe — apenas resolve via IServiceProvider)

**Critérios de aceitação:**
- [ ] Factory resolve o provider correto dado um `providerId`
- [ ] Lança exceção explícita se `providerId` não encontrado — nunca retorna null silenciosamente
- [ ] Testes unitários: provider encontrado, provider não encontrado
- [ ] Lifecycle documentado no código

---

### WIA-217 — Resiliência com Polly + Abstração de Secrets

**Depende de:** WIA-216

Garantir que falhas transitórias em PSPs externos não derrubem a plataforma, e que credenciais de API nunca apareçam em logs.

**Políticas Polly:**

```csharp
// Infrastructure/ProviderResiliencePolicy.cs
public static class ProviderResiliencePolicy
{
    // Retry: 3 tentativas com backoff exponencial
    public static IAsyncPolicy<HttpResponseMessage> RetryPolicy =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt =>
                    TimeSpan.FromSeconds(Math.Pow(2, attempt)));

    // Circuit Breaker: abre após 5 falhas em 30s, fica aberto por 60s
    public static IAsyncPolicy<HttpResponseMessage> CircuitBreakerPolicy =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .CircuitBreakerAsync(
                handledEventsAllowedBeforeBreaking: 5,
                durationOfBreak: TimeSpan.FromSeconds(60));
}
```

**Aplicação:**

```csharp
// Registro no HttpClient do provider
builder.Services
    .AddHttpClient<CelcoinProvider>()
    .AddPolicyHandler(ProviderResiliencePolicy.RetryPolicy)
    .AddPolicyHandler(ProviderResiliencePolicy.CircuitBreakerPolicy);
```

**Abstração de Secrets:**

```csharp
// Interfaces/IProviderSecretProvider.cs
public interface IProviderSecretProvider
{
    Task<string> GetApiKeyAsync(string providerId, CancellationToken ct = default);
    Task<string> GetSecretAsync(string key, CancellationToken ct = default);
}
```

- Implementações concretas: `AzureKeyVaultSecretProvider`, `AwsSecretsManagerSecretProvider`
- Implementação de desenvolvimento: `EnvironmentSecretProvider` (apenas para local/staging — nunca produção)
- API keys dos providers **nunca** em variáveis de ambiente em texto puro em produção

**Log Sanitizer:**

```csharp
// Infrastructure/ProviderLogSanitizer.cs
// Decorator sobre IPaymentProvider — intercepta todos os logs das implementações
public sealed class LogSanitizingProviderDecorator : IPaymentProvider
{
    private static readonly string[] SensitiveFields =
        ["apiKey", "secretKey", "authorization", "payerDocument", "payerName"];

    // Substituir valores de campos sensíveis por "[REDACTED]" antes de logar
}
```

**Critérios de aceitação:**
- [ ] Retry com backoff exponencial funcionando nos testes de integração
- [ ] Circuit breaker abre após 5 falhas consecutivas
- [ ] Nenhuma API key ou secret de PSP aparece em logs (validado por teste que inspeciona output)
- [ ] `payerDocument` e `payerName` redacted em todos os logs do decorator

---

## Como este epic habilita WIA-272 (Billing Links)

Quando um pagador acessa `POST /v1/public/charge/{linkId}`:

1. `PublicChargeService` (Node.js) chama `.NET CreateTransactionService` via HTTP interno
2. `CreateTransactionService` consulta o acquirer ativo do seller do `BillingLink`
3. `ProviderFactory.GetProvider(acquirer.providerId)` resolve o `IPaymentProvider` correto
4. `IPaymentProvider.CreateChargeAsync(request)` chama o PSP via HTTP com Polly
5. Resposta retorna `PixQrCode` e `PixCopiaECola` para o pagador

Trocar o PSP de um seller requer apenas alterar o `providerId` na configuração do acquirer — sem deploy.

---

## Dependências

- WIA-204 (usa `TransactionStatus`, `PaymentMethodType` dos enums de domínio)

## Riscos

| Risco | Mitigação |
|-------|-----------|
| API key de PSP exposta em log de erro | Decorator `LogSanitizingProviderDecorator` em todas as chamadas |
| Circuit breaker muito agressivo gera false positives | Calibrar thresholds em staging com tráfego real antes de produção |
| Provider não registrado para um seller | `ProviderFactory` lança exceção explícita com `providerId` no erro (sem dados sensíveis) |
| Retry storm: múltiplos retries simultâneos sobrecarregam PSP | Jitter no backoff — adicionar `TimeSpan.FromMilliseconds(Random.Shared.Next(0, 1000))` |
