export class PiiSanitizer {
  private static readonly PII_FIELDS = ['name', 'cpf', 'payerName', 'payerCpf', 'pan', 'cvv'];

  static sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...data };
    for (const field of PiiSanitizer.PII_FIELDS) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  static safeBody(body: Record<string, unknown>): string {
    return JSON.stringify(PiiSanitizer.sanitize(body));
  }
}
