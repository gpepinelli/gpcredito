import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Check, CircleDollarSign, ClipboardList, FileText, PackagePlus, Phone, RefreshCw, Save, X } from 'lucide-react';
import { Modal, PageHeader, Stat } from '../components/layout.jsx';
import { SortTh } from '../components/common.jsx';
import { useOrdenacao } from '../hooks/useOrdenacao.js';
import { api } from '../lib/api.js';
import { JUROS_NORMAL_VENDA, TIPOS } from '../lib/constants.js';
import { dataCurta, moeda } from '../lib/format.js';

export function Relatorios() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  async function carregarRelatorios() {
    setErro('');
    try {
      const [lucro, mensal, aging, logs, whats] = await Promise.all([
        api('/lucro'),
        api('/relatorio/mensal'),
        api('/admin/inadimplencia/aging'),
        api('/admin/logs?limit=10'),
        api('/admin/whatsapp/status'),
      ]);
      setDados({ lucro, mensal: mensal.metricas || [], aging: aging.aging, logs: logs.logs || [], whats: whats.status });
    } catch (error) {
      setErro(error.message);
    }
  }

  useEffect(() => { carregarRelatorios(); }, []);

  async function exportarCsv() {
    const resposta = await api('/relatorio/export');
    const linhas = [
      ['Operacao', 'Contrato', 'Cliente', 'Telefone', 'Valor', 'Total', 'Status', 'Vencimento'],
      ...(resposta.emprestimos || []).map((e) => [e.numeroOperacao, e.numeroContrato || '', e.cliente?.nome || '', e.cliente?.telefone || '', e.valor, e.valorTotal, e.statusOperacao, dataCurta(e.dataVencimento)]),
    ];
    const csv = linhas.map((linha) => linha.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `gpcredito-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Relatorios" subtitle="Resumo financeiro e exportacao" action={<button className="primaryButton" onClick={exportarCsv}><FileText size={17} /> Exportar CSV</button>} />
      {erro && <div className="errorBanner">{erro}</div>}
      {!dados && !erro && <div className="loadingLine">Carregando...</div>}
      {dados && (
        <>
          <div className="statsGrid compact">
            <Stat icon={BadgeDollarSign} label="Total emprestado" value={moeda(dados.lucro.totalEmprestado)} />
            <Stat icon={CircleDollarSign} label="Total recebido" value={moeda(dados.lucro.totalRecebido)} tone="green" />
            <Stat icon={FileText} label="Lucro em juros" value={moeda(dados.lucro.lucroJuros)} tone="amber" />
            <Stat icon={Phone} label="WhatsApp" value={dados.whats?.connected ? 'Online' : 'Offline'} tone={dados.whats?.connected ? 'green' : 'red'} />
          </div>
          <section className="contentGrid">
            <article className="panel">
              <div className="panelTitle">Aging de inadimplencia</div>
              <div className="moduleRows">
                {Object.entries(dados.aging || {}).map(([key, faixa]) => (
                  <div className="moduleRow" key={key}>
                    <BadgeDollarSign size={20} />
                    <div><strong>{faixa.label}</strong><span>{faixa.total} operacao(oes)</span></div>
                    <b>{moeda(faixa.valor)}</b>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="panelTitle">Ultimas acoes</div>
              <div className="moduleRows">
                {dados.logs.length === 0 && <span className="hint">Nenhuma acao registrada.</span>}
                {dados.logs.map((log) => (
                  <div className="moduleRow" key={log.id}>
                    <ClipboardList size={20} />
                    <div><strong>{log.tipo}</strong><span>{log.mensagem} - {dataCurta(log.criadoEm)}</span></div>
                  </div>
                ))}
              </div>
            </article>
          </section>
          <div className="tablePanel">
            <table>
              <thead><tr><th>Mes</th><th>Emprestado</th><th>Recebido</th><th>Lucro</th><th>Operacoes</th><th>Pagamentos</th></tr></thead>
              <tbody>{dados.mensal.map((mes) => (
                <tr key={mes.mes}><td>{mes.mes}</td><td>{moeda(mes.emprestados)}</td><td>{moeda(mes.recebidos)}</td><td>{moeda(mes.lucro)}</td><td>{mes.qtd}</td><td>{mes.qPagos}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function RelatorioVendas({ vendas, resumoVendas, cancelarVenda }) {
  const concluidas = vendas.filter((venda) => venda.status === 'CONCLUIDA');
  const camposOrdenacao = useMemo(() => ({
    tipo: (venda) => venda.produto?.tipo || '',
    produto: (venda) => venda.produto?.titulo || '',
    comprador: (venda) => venda.compradorNome || '',
    base: (venda) => Number(venda.valorBase || venda.produto?.valorVenda || 0),
    total: (venda) => Number(venda.valorVenda || 0),
    entrada: (venda) => Number(venda.valorEntrada || 0),
    parcelas: (venda) => Number(venda.parcelas || 1),
    lucro: (venda) => Number(venda.valorVenda || 0) - Number(venda.produto?.valorCusto || 0),
    data: (venda) => venda.concluidoEm || venda.criadoEm,
  }), []);
  const { ordenados, ordem, ordenar } = useOrdenacao(concluidas, camposOrdenacao, { campo: 'data', direcao: 'desc' });
  const faturamento = concluidas.reduce((acc, venda) => acc + Number(venda.valorVenda || 0), 0);
  const lucro = concluidas.reduce((acc, venda) => acc + (Number(venda.valorVenda || 0) - Number(venda.produto?.valorCusto || 0)), 0);
  const ticketMedio = concluidas.length ? faturamento / concluidas.length : 0;

  function exportarCsv() {
    const linhas = [
      ['Tipo', 'Produto', 'Comprador', 'Telefone', 'Base', 'Juros %', 'Total', 'Entrada', 'Parcelas', 'Valor parcela', 'Lucro', 'Data'],
      ...concluidas.map((venda) => [
        venda.produto?.tipo || '',
        venda.produto?.titulo || '',
        venda.compradorNome || '',
        venda.compradorTelefone || '',
        venda.valorBase || '',
        venda.jurosPercentual ?? JUROS_NORMAL_VENDA,
        venda.valorVenda,
        venda.valorEntrada,
        venda.parcelas,
        venda.valorParcela || '',
        Number(venda.valorVenda || 0) - Number(venda.produto?.valorCusto || 0),
        dataCurta(venda.concluidoEm || venda.criadoEm),
      ]),
    ];
    const csv = linhas.map((linha) => linha.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `gpcredito-vendas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Relatorio de vendas" subtitle="Resumo financeiro de carros, motos e celulares" action={<button className="primaryButton" onClick={exportarCsv}><FileText size={17} /> Exportar CSV</button>} />
      <div className="statsGrid">
        <Stat icon={CircleDollarSign} label="Faturamento" value={moeda(faturamento)} />
        <Stat icon={FileText} label="Lucro estimado" value={moeda(lucro)} tone="amber" />
        <Stat icon={PackagePlus} label="Vendas concluidas" value={concluidas.length} tone="green" />
        <Stat icon={ClipboardList} label="Ticket medio" value={moeda(ticketMedio)} tone="red" />
      </div>
      <section className="contentGrid">
        <article className="panel">
          <div className="panelTitle">Resultado por modulo</div>
          <div className="moduleRows">
            {TIPOS.map((tipo) => {
              const Icon = tipo.icon;
              const item = resumoVendas?.porTipo?.[tipo.id] || {};
              return (
                <div className="moduleRow" key={tipo.id}>
                  <Icon size={20} />
                  <div><strong>{tipo.label}</strong><span>{item.vendidos || 0} vendidos - {item.estoque || 0} em estoque</span></div>
                  <b>{moeda(item.faturamento || 0)}</b>
                </div>
              );
            })}
          </div>
        </article>
        <article className="panel">
          <div className="panelTitle">Margem estimada</div>
          <div className="resultBox"><span>Lucro total</span><strong>{moeda(lucro)}</strong></div>
          <div className="resultBox quiet"><span>Margem media</span><strong>{faturamento ? `${((lucro / faturamento) * 100).toFixed(1)}%` : '0%'}</strong></div>
        </article>
      </section>
      <div className="tablePanel tableWithTop">
        <table className="responsiveTable">
          <thead><tr>
            <SortTh campo="tipo" ordem={ordem} ordenar={ordenar}>Tipo</SortTh>
            <SortTh campo="produto" ordem={ordem} ordenar={ordenar}>Produto</SortTh>
            <SortTh campo="comprador" ordem={ordem} ordenar={ordenar}>Comprador</SortTh>
            <SortTh campo="base" ordem={ordem} ordenar={ordenar}>Base</SortTh>
            <SortTh campo="total" ordem={ordem} ordenar={ordenar}>Total</SortTh>
            <SortTh campo="entrada" ordem={ordem} ordenar={ordenar}>Entrada</SortTh>
            <SortTh campo="parcelas" ordem={ordem} ordenar={ordenar}>Parcelas</SortTh>
            <SortTh campo="lucro" ordem={ordem} ordenar={ordenar}>Lucro</SortTh>
            <SortTh campo="data" ordem={ordem} ordenar={ordenar}>Data</SortTh>
            <th>Acoes</th>
          </tr></thead>
          <tbody>
            {concluidas.length === 0 && <tr><td colSpan="10">Nenhuma venda concluida.</td></tr>}
            {ordenados.map((venda) => (
              <tr key={venda.id}>
                <td data-label="Tipo">{venda.produto?.tipo}</td>
                <td data-label="Produto">{venda.produto?.titulo}</td>
                <td data-label="Comprador">{venda.compradorNome}</td>
                <td data-label="Base">{moeda(venda.valorBase || venda.produto?.valorVenda)}</td>
                <td data-label="Total">{moeda(venda.valorVenda)}</td>
                <td data-label="Entrada">{moeda(venda.valorEntrada)}</td>
                <td data-label="Parcelas">{venda.parcelas}x de {moeda(venda.valorParcela || ((Number(venda.valorVenda || 0) - Number(venda.valorEntrada || 0)) / Number(venda.parcelas || 1)))}</td>
                <td data-label="Lucro">{moeda(Number(venda.valorVenda || 0) - Number(venda.produto?.valorCusto || 0))}</td>
                <td data-label="Data">{dataCurta(venda.concluidoEm || venda.criadoEm)}</td>
                <td data-label="Acoes"><button className="dangerButton" onClick={() => cancelarVenda(venda)} title="Cancelar venda"><X size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const CATEGORIAS_CONFIG = [
  ['CREDITO', 'Credito'],
  ['SCORE', 'Score'],
  ['COBRANCA', 'Cobranca'],
  ['VENDAS', 'Vendas'],
  ['PIX', 'Pix e pagamento'],
  ['WHATSAPP', 'WhatsApp'],
  ['SISTEMA', 'Sistema'],
];

function inputConfig(item, valor, onChange) {
  if (item.tipo === 'BOOLEAN') {
    return (
      <label className="toggleLine">
        <input type="checkbox" checked={String(valor).toLowerCase() === 'true'} onChange={(event) => onChange(event.target.checked ? 'true' : 'false')} />
        <span>{String(valor).toLowerCase() === 'true' ? 'Ativado' : 'Desativado'}</span>
      </label>
    );
  }
  if (item.tipo === 'TIME') return <input type="time" value={valor || ''} onChange={(event) => onChange(event.target.value)} />;
  if (item.tipo === 'NUMBER') return <input type="number" min={item.min ?? undefined} max={item.max ?? undefined} step="0.01" value={valor ?? ''} onChange={(event) => onChange(event.target.value)} />;
  if (String(item.chave || '').startsWith('WHATSAPP_TEMPLATE_')) {
    return <textarea className="configTextarea" rows={6} value={valor ?? ''} onChange={(event) => onChange(event.target.value)} />;
  }
  return <input type="text" value={valor ?? ''} onChange={(event) => onChange(event.target.value)} />;
}

export function Configuracoes({ notificar, onAtualizarPadroes }) {
  const [configs, setConfigs] = useState([]);
  const [valores, setValores] = useState({});
  const [categoria, setCategoria] = useState('CREDITO');
  const [erro, setErro] = useState('');
  const [resetTodos, setResetTodos] = useState(false);
  const [senha, setSenha] = useState('');

  async function carregar() {
    setErro('');
    try {
      const resposta = await api('/configuracoes');
      setConfigs(resposta.configuracoes || []);
      setValores(Object.fromEntries((resposta.configuracoes || []).map(item => [item.chave, item.valor])));
      onAtualizarPadroes?.(resposta.configuracoes || []);
    } catch (error) {
      setErro(error.message);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar(item) {
    try {
      const resposta = await api(`/configuracoes/${item.chave}`, { method: 'PUT', body: JSON.stringify({ valor: valores[item.chave] }) });
      setConfigs((atuais) => atuais.map(config => config.chave === item.chave ? resposta.configuracao : config));
      setValores((atuais) => ({ ...atuais, [item.chave]: resposta.configuracao.valor }));
      onAtualizarPadroes?.([resposta.configuracao]);
      notificar?.('sucesso', `${item.chave} salva.`);
    } catch (error) {
      notificar?.('erro', error.message);
    }
  }

  async function restaurar(item) {
    try {
      const resposta = await api(`/configuracoes/reset/${item.chave}`, { method: 'POST', body: JSON.stringify({}) });
      setConfigs((atuais) => atuais.map(config => config.chave === item.chave ? resposta.configuracao : config));
      setValores((atuais) => ({ ...atuais, [item.chave]: resposta.configuracao.valor }));
      onAtualizarPadroes?.([resposta.configuracao]);
      notificar?.('sucesso', `${item.chave} restaurada.`);
    } catch (error) {
      notificar?.('erro', error.message);
    }
  }

  async function restaurarTodos(event) {
    event.preventDefault();
    try {
      const resposta = await api('/configuracoes/reset/todos', { method: 'POST', body: JSON.stringify({ senha }) });
      setConfigs(resposta.configuracoes || []);
      setValores(Object.fromEntries((resposta.configuracoes || []).map(item => [item.chave, item.valor])));
      onAtualizarPadroes?.(resposta.configuracoes || []);
      setResetTodos(false);
      setSenha('');
      notificar?.('sucesso', 'Todos os padroes foram restaurados.');
    } catch (error) {
      notificar?.('erro', error.message);
    }
  }

  const lista = configs.filter(item => {
    const templateWhatsapp = String(item.chave || '').startsWith('WHATSAPP_TEMPLATE_');
    if (categoria === 'WHATSAPP') return templateWhatsapp;
    if (categoria === 'SISTEMA') return item.categoria === 'SISTEMA' && !templateWhatsapp;
    return item.categoria === categoria;
  });

  return (
    <>
      <PageHeader title="Configuracoes" subtitle="Parametros operacionais do sistema" action={<button className="dangerButton textButton" onClick={() => setResetTodos(true)}><RefreshCw size={16} /> Restaurar todos</button>} />
      {erro && <div className="errorBanner">{erro}</div>}
      <div className="tabs">
        {CATEGORIAS_CONFIG.map(([id, label]) => <button key={id} className={categoria === id ? 'active' : ''} onClick={() => setCategoria(id)}>{label}</button>)}
      </div>
      <div className="settingsGrid">
        {lista.map((item) => {
          const alterado = String(valores[item.chave] ?? '') !== String(item.padrao ?? '');
          return (
            <article className={alterado ? 'configCard changed' : 'configCard'} key={item.chave}>
              <div>
                <strong>{item.chave}</strong>
                <p>{item.descricao}</p>
              </div>
              {inputConfig(item, valores[item.chave], (valor) => setValores((atuais) => ({ ...atuais, [item.chave]: valor })))}
              <span className="hint">Padrao de fabrica: {item.padrao === '' ? '-' : item.padrao}</span>
              {alterado && <span className="badge reservado">Alterado</span>}
              <div className="rowActions">
                <button className="primaryButton" onClick={() => salvar(item)}><Save size={16} /> Salvar</button>
                <button className="ghostButton" onClick={() => restaurar(item)}><RefreshCw size={16} /> Restaurar</button>
              </div>
            </article>
          );
        })}
      </div>
      <Modal aberto={resetTodos} titulo="Restaurar todos os padroes" subtitulo="Esta acao remove configuracoes salvas no banco e volta aos defaults/env." icon={RefreshCw} onClose={() => setResetTodos(false)}>
        <form className="modalForm" onSubmit={restaurarTodos}>
          <div className="warningBox">Digite a senha de exclusao para confirmar a restauracao geral.</div>
          <label>Senha de exclusao</label>
          <input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} required />
          <div className="modalActions">
            <button className="ghostButton" type="button" onClick={() => setResetTodos(false)}>Cancelar</button>
            <button className="dangerButton textButton" type="submit"><Check size={16} /> Restaurar tudo</button>
          </div>
        </form>
      </Modal>
    </>
  );
}


