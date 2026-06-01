export function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataCurta(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleDateString('pt-BR');
}
