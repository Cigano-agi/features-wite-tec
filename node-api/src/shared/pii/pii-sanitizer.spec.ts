import { PiiSanitizer } from './pii-sanitizer';

describe('PiiSanitizer', () => {
  it('redacts name field', () => {
    const result = PiiSanitizer.sanitize({ name: 'John Doe', amount: 100 });
    expect(result.name).toBe('[REDACTED]');
    expect(result.amount).toBe(100);
  });

  it('redacts cpf field', () => {
    const result = PiiSanitizer.sanitize({ cpf: '12345678901', status: 'active' });
    expect(result.cpf).toBe('[REDACTED]');
  });

  it('redacts payerName and payerCpf', () => {
    const result = PiiSanitizer.sanitize({ payerName: 'Jane', payerCpf: '98765432100' });
    expect(result.payerName).toBe('[REDACTED]');
    expect(result.payerCpf).toBe('[REDACTED]');
  });

  it('does not mutate the original object', () => {
    const original = { name: 'John', amount: 100 };
    PiiSanitizer.sanitize(original);
    expect(original.name).toBe('John');
  });

  it('safeBody produces JSON without PII', () => {
    const body = PiiSanitizer.safeBody({ name: 'John', cpf: '123', amount: 100 });
    expect(body).not.toContain('John');
    expect(body).not.toContain('123');
    expect(body).toContain('[REDACTED]');
    expect(body).toContain('100');
  });

  it('leaves non-PII fields unchanged', () => {
    const result = PiiSanitizer.sanitize({ amount: 500, description: 'product', sellerId: 'uuid-1' });
    expect(result.amount).toBe(500);
    expect(result.description).toBe('product');
    expect(result.sellerId).toBe('uuid-1');
  });
});
