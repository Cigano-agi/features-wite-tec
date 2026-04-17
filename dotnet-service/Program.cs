using Microsoft.EntityFrameworkCore;
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

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required");

builder.Services.AddDbContext<BillingDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<ITransactionRepository, EfTransactionRepository>();
builder.Services.AddScoped<CreateTransactionUseCase>();

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.MapControllers();

app.Run();
