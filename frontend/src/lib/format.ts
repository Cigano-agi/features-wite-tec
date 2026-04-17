export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function centsFromReais(reais: string): number {
  const cleaned = reais.replace(',', '.');
  return Math.round(parseFloat(cleaned) * 100);
}
