using Serilog;
using WitetecBillingService.API.Middleware;
using WitetecBillingService.Application.Interfaces;
using WitetecBillingService.Application.UseCases;
using WitetecBillingService.Infrastructure.Persistence;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties}{NewLine}{Exception}")
    .CreateLogger();

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSingleton<ITransactionRepository, InMemoryTransactionRepository>();
builder.Services.AddScoped<CreateTransactionUseCase>();

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.MapControllers();

app.Run();
