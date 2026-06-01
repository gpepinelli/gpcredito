import React from 'react';

export function StatusBadge({ status }) {
  return <span className={`badge ${String(status).toLowerCase()}`}>{String(status || '-').replaceAll('_', ' ')}</span>;
}

export function ScoreBar({ score = 0 }) {
  const valor = Math.max(0, Math.min(200, Number(score || 0)));
  const porcentagem = Math.round((valor / 200) * 100);
  const nivel = valor < 50 ? 'bloqueado' : valor < 80 ? 'medio' : 'confiavel';
  const texto = valor < 50 ? 'Bloqueado' : valor < 80 ? 'Risco medio' : 'Confiavel';

  return (
    <div className={`scoreBar ${nivel}`}>
      <div className="scoreHeader">
        <b>{valor}</b>
        <span>{texto}</span>
      </div>
      <div className="scoreTrack"><i style={{ width: `${porcentagem}%` }} /></div>
    </div>
  );
}

export function SortTh({ campo, ordem, ordenar, children }) {
  const ativo = ordem.campo === campo;
  return (
    <th>
      <button className={ativo ? 'sortButton active' : 'sortButton'} type="button" onClick={() => ordenar(campo)}>
        {children}<span>{ativo ? (ordem.direcao === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}
