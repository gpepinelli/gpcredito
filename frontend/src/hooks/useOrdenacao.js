import { useMemo, useState } from 'react';

function compararValores(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const dataA = Date.parse(a);
  const dataB = Date.parse(b);
  if (!Number.isNaN(dataA) && !Number.isNaN(dataB)) return dataA - dataB;
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function useOrdenacao(lista, mapaCampos, inicial = { campo: '', direcao: 'asc' }) {
  const [ordem, setOrdem] = useState(inicial);
  const ordenados = useMemo(() => {
    if (!ordem.campo || !mapaCampos[ordem.campo]) return lista;
    const obter = mapaCampos[ordem.campo];
    return [...lista].sort((a, b) => {
      const resultado = compararValores(obter(a), obter(b));
      return ordem.direcao === 'asc' ? resultado : -resultado;
    });
  }, [lista, mapaCampos, ordem]);

  function ordenar(campo) {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }));
  }

  return { ordenados, ordem, ordenar };
}
