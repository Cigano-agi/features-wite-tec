namespace WitetecBillingService.API.Middleware;

public class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    private const string Header = "x-correlation-id";

    public CorrelationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.ContainsKey(Header))
            context.Request.Headers[Header] = Guid.NewGuid().ToString();

        context.Response.Headers[Header] = context.Request.Headers[Header];
        await _next(context);
    }
}
