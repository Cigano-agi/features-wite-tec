using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WitetecBillingService.Domain.Entities;

namespace WitetecBillingService.Infrastructure.Persistence;

public class BillingDbContext : DbContext
{
    public BillingDbContext(DbContextOptions<BillingDbContext> options) : base(options) { }

    public DbSet<Transaction> Transactions => Set<Transaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.ToTable("psp_transactions");
            entity.HasKey(t => t.TransactionId);
            entity.Property(t => t.TransactionId).ValueGeneratedNever();
            entity.Property(t => t.BillingLinkId).IsRequired();
            entity.Property(t => t.Amount).IsRequired();
            entity.Property(t => t.PayerName).IsRequired().HasMaxLength(256);
            entity.Property(t => t.PayerCpf).IsRequired().HasMaxLength(14);
            entity.Property(t => t.PayerEmail).IsRequired().HasMaxLength(320);
            entity.Property(t => t.PayerPhone).IsRequired().HasMaxLength(20);
            entity.Property(t => t.Status).IsRequired().HasConversion<string>().HasMaxLength(20);
            entity.Property(t => t.Metadata)
                .HasColumnType("jsonb")
                .HasConversion(
                    v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                    v => JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new()
                );
            entity.Property(t => t.CreatedAt).IsRequired();
            entity.Property(t => t.UpdatedAt).IsRequired();
            entity.HasIndex(t => t.BillingLinkId).HasDatabaseName("idx_psp_transactions_billing_link_id");
        });
    }
}
