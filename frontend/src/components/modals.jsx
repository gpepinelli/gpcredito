import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, Check, ClipboardList, FileText, Home, Plus, RefreshCw, Trash2, Upload, Users, X } from 'lucide-react';
import { ScoreBar, StatusBadge } from './common.jsx';
import { Modal } from './layout.jsx';
import { api, apiUpload } from '../lib/api.js';
import { dataCurta, moeda } from '../lib/format.js';

export function PagamentoModal({ emprestimo, onClose, onConfirmar }) {
  const [valorPago, setValorPago] = useState(emprestimo?.valorTotal || '');
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  async function confirmar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onConfirmar(emprestimo.id, Number(valorPago));
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  async function copiarPix() {
    if (!emprestimo?.pixCopiaCola) return;
    await navigator.clipboard.writeText(emprestimo.pixCopiaCola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Modal aberto={Boolean(emprestimo)} titulo="Confirmar pagamento" subtitulo={`Registre o pagamento de ${emprestimo?.cliente?.nome || 'cliente'}.`} icon={Check} onClose={onClose}>
      <form className="modalForm" onSubmit={confirmar}>
        <label>Valor pago (R$)</label>
        <input value={valorPago} onChange={(event) => setValorPago(event.target.value)} type="number" min="0.01" step="0.01" required />
        {emprestimo?.pixCopiaCola && <div className="pixBox"><span>{emprestimo.pixCopiaCola}</span><button className="ghostButton" type="button" onClick={copiarPix}>{copiado ? 'Copiado!' : 'Copiar'}</button></div>}
        {erro && <span className="formError">{erro}</span>}
        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
          <button className="primaryButton" type="submit"><Check size={16} /> Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}

export function ParcelasModal({ emprestimo, onClose, onPagarParcela }) {
  const [erro, setErro] = useState('');
  const parcelas = (emprestimo?.parcelas || []).slice().sort((a, b) => a.numero - b.numero);
  const saldoAberto = parcelas.filter((parcela) => parcela.status !== 'pago').reduce((acc, parcela) => acc + Number(parcela.valor || 0), 0);
  const totalPago = parcelas.filter((parcela) => parcela.status === 'pago').reduce((acc, parcela) => acc + Number(parcela.valor || 0), 0);

  async function pagar(parcelaId) {
    setErro('');
    try {
      await onPagarParcela(emprestimo.id, parcelaId);
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(emprestimo)} titulo={`Parcelas da operacao ${emprestimo?.numeroOperacao || ''}`} subtitulo={`${emprestimo?.cliente?.nome || 'Cliente'} - ${moeda(emprestimo?.valor)} principal - ${emprestimo?.juros || 0}% de juros`} icon={BadgeDollarSign} onClose={onClose} size="modalWide">
      <div className="summaryStrip">
        <div><span>Total</span><b>{moeda(emprestimo?.valorTotal)}</b></div>
        <div><span>Pago</span><b>{moeda(totalPago)}</b></div>
        <div><span>Em aberto</span><b>{moeda(saldoAberto)}</b></div>
      </div>
      {erro && <span className="formError">{erro}</span>}
      <div className="miniTable">
        <table>
          <thead><tr><th>#</th><th>Valor</th><th>Juros</th><th>Saldo depois</th><th>Vencimento</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>
            {parcelas.length === 0 && <tr><td colSpan="7">Este emprestimo nao possui parcelas detalhadas.</td></tr>}
            {parcelas.map((parcela) => (
              <tr key={parcela.id}>
                <td>{parcela.numero}</td>
                <td>{moeda(parcela.valor)}</td>
                <td>{moeda(parcela.valorJuros)}</td>
                <td>{moeda(parcela.saldoDepois)}</td>
                <td>{dataCurta(parcela.dataVencimento)}</td>
                <td><StatusBadge status={parcela.status} /></td>
                <td>{parcela.status === 'pago' ? <span className="muted">Liquidada</span> : <button className="smallButton" onClick={() => pagar(parcela.id)}>Pagar parcela</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function ExclusaoModal({ alvo, onClose, onConfirmar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function confirmar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onConfirmar(alvo, senha);
      setSenha('');
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(alvo)} titulo={`Excluir ${alvo?.tipo === 'cliente' ? 'cliente' : alvo?.tipo === 'orcamento' ? 'orcamento' : 'emprestimo'}`} subtitulo={`Tem certeza que deseja excluir ${alvo?.nome || 'este registro'}? Esta acao nao pode ser desfeita.`} icon={Trash2} onClose={onClose}>
      <form className="modalForm" onSubmit={confirmar}>
        {alvo?.resumo && (
          <div className="warningBox">
            {alvo.resumo}
          </div>
        )}
        <label>Senha de exclusao</label>
        <input value={senha} onChange={(event) => setSenha(event.target.value)} type="password" placeholder="Senha de exclusao" required />
        {erro && <span className="formError">{erro}</span>}
        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
          <button className="dangerButton textButton" type="submit"><Trash2 size={16} /> Excluir permanentemente</button>
        </div>
      </form>
    </Modal>
  );
}

export function ProdutoExclusaoModal({ produto, onClose, onConfirmar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (produto) {
      setSenha('');
      setErro('');
    }
  }, [produto]);

  async function confirmar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onConfirmar(produto, senha);
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(produto)} titulo="Excluir item de venda" subtitulo={`Remover ${produto?.titulo || 'este item'} do estoque.`} icon={Trash2} onClose={onClose}>
      <form className="modalForm" onSubmit={confirmar}>
        <div className="warningBox">Itens vendidos nao podem ser excluidos. Esta acao remove o produto do estoque definitivamente.</div>
        <label>Senha de exclusao</label>
        <input value={senha} onChange={(event) => setSenha(event.target.value)} type="password" placeholder="Senha de exclusao" required />
        {erro && <span className="formError">{erro}</span>}
        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
          <button className="dangerButton textButton" type="submit"><Trash2 size={16} /> Excluir item</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmacaoModal({ dados, onClose, onConfirmar }) {
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (dados) setErro('');
  }, [dados]);

  async function confirmar() {
    setErro('');
    try {
      await onConfirmar(dados);
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(dados)} titulo={dados?.titulo || 'Confirmar acao'} subtitulo={dados?.subtitulo} icon={dados?.perigo ? Trash2 : Check} onClose={onClose}>
      {dados?.resumo && <div className={dados.perigo ? 'warningBox' : 'previewBox'}>{dados.resumo}</div>}
      {erro && <span className="formError">{erro}</span>}
      <div className="modalActions">
        <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
        <button className={dados?.perigo ? 'dangerButton textButton' : 'primaryButton'} type="button" onClick={confirmar}>
          {dados?.perigo ? <X size={16} /> : <Check size={16} />} Confirmar
        </button>
      </div>
    </Modal>
  );
}

export function ObservacaoModal({ emprestimo, onClose, onSalvar }) {
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    setObservacao(emprestimo?.observacao || '');
    setErro('');
  }, [emprestimo]);

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onSalvar(emprestimo, observacao);
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(emprestimo)} titulo="Observacao da operacao" subtitulo={emprestimo?.numeroOperacao} icon={ClipboardList} onClose={onClose}>
      <form className="modalForm" onSubmit={salvar}>
        <label>Nota interna</label>
        <textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows="5" placeholder="Acordos, contexto do cliente ou combinados verbais." />
        {erro && <span className="formError">{erro}</span>}
        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
          <button className="primaryButton" type="submit"><Check size={16} /> Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function RenegociacaoModal({ emprestimo, onClose, onSalvar }) {
  const [form, setForm] = useState({ dataVencimento: '', observacao: '' });
  const [erro, setErro] = useState('');

  useEffect(() => {
    setForm({
      dataVencimento: emprestimo?.dataVencimento ? new Date(emprestimo.dataVencimento).toISOString().slice(0, 10) : '',
      observacao: emprestimo?.observacao || '',
    });
    setErro('');
  }, [emprestimo]);

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onSalvar(emprestimo, form);
      onClose();
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <Modal aberto={Boolean(emprestimo)} titulo="Renegociar prazo" subtitulo={emprestimo?.numeroOperacao} icon={RefreshCw} onClose={onClose}>
      <form className="modalForm" onSubmit={salvar}>
        <label>Novo vencimento</label>
        <input value={form.dataVencimento} onChange={(event) => setForm({ ...form, dataVencimento: event.target.value })} type="date" required />
        <label>Observacao</label>
        <textarea value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} rows="4" placeholder="Motivo ou acordo da renegociacao." />
        {erro && <span className="formError">{erro}</span>}
        <div className="modalActions">
          <button className="ghostButton" type="button" onClick={onClose}>Cancelar</button>
          <button className="primaryButton" type="submit"><Check size={16} /> Salvar prazo</button>
        </div>
      </form>
    </Modal>
  );
}

export function ClienteDetalheModal({ clienteId, onClose, onDocumentoAlterado, onNovaOperacao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('dados');
  const [uploadErro, setUploadErro] = useState('');
  const [promessaForm, setPromessaForm] = useState({ emprestimoId: '', valor: '', dataPrometida: '', observacao: '' });
  const [acaoMsg, setAcaoMsg] = useState('');

  useEffect(() => {
    if (!clienteId) return;
    setDados(null);
    setErro('');
    setAba('dados');
    api(`/clientes/${clienteId}/historico`)
      .then(setDados)
      .catch((error) => setErro(error.message));
  }, [clienteId]);

  async function enviarDocumento(tipoDocumento, arquivo) {
    if (!arquivo || !clienteId) return;
    setUploadErro('');
    try {
      const formData = new FormData();
      formData.append('tipoDocumento', tipoDocumento);
      formData.append('arquivo', arquivo);
      await apiUpload(`/clientes/${clienteId}/documentos`, formData);
      const atualizado = await api(`/clientes/${clienteId}/historico`);
      setDados(atualizado);
      onDocumentoAlterado?.();
    } catch (error) {
      setUploadErro(error.message);
    }
  }

  async function excluirDocumento(documentoId) {
    if (!clienteId) return;
    setUploadErro('');
    try {
      await api(`/clientes/${clienteId}/documentos/${documentoId}`, { method: 'DELETE' });
      const atualizado = await api(`/clientes/${clienteId}/historico`);
      setDados(atualizado);
      onDocumentoAlterado?.();
    } catch (error) {
      setUploadErro(error.message);
    }
  }

  async function criarPromessa(event) {
    event.preventDefault();
    setAcaoMsg('');
    try {
      await api(`/emprestimos/${promessaForm.emprestimoId}/promessas`, { method: 'POST', body: JSON.stringify(promessaForm) });
      const atualizado = await api(`/clientes/${clienteId}/historico`);
      setDados(atualizado);
      setPromessaForm({ emprestimoId: '', valor: '', dataPrometida: '', observacao: '' });
      setAcaoMsg('Promessa registrada.');
    } catch (error) {
      setAcaoMsg(error.message);
    }
  }

  async function atualizarPromessa(id, status) {
    setAcaoMsg('');
    try {
      await api(`/promessas-pagamento/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const atualizado = await api(`/clientes/${clienteId}/historico`);
      setDados(atualizado);
    } catch (error) {
      setAcaoMsg(error.message);
    }
  }

  async function reenviarRecibo(pagamentoId) {
    setAcaoMsg('');
    try {
      await api(`/pagamentos/${pagamentoId}/reenviar-recibo`, { method: 'POST', body: JSON.stringify({}) });
      setAcaoMsg('Recibo reenviado.');
    } catch (error) {
      setAcaoMsg(error.message);
    }
  }

  const cliente = dados?.cliente;
  const abas = ['dados', 'score', 'operacoes', 'parcelas', 'acordos', 'contratos', 'documentos'];
  const labelsAbas = {
    dados: 'Dados',
    score: 'Score',
    operacoes: 'Operacoes',
    parcelas: 'Parcelas',
    acordos: 'Acordos',
    contratos: 'Contratos',
    documentos: 'Documentos',
  };
  const pagamentosPorParcela = new Map((dados?.pagamentos || []).filter(p => p.parcelaId).map(p => [p.parcelaId, p]));

  return (
    <Modal aberto={Boolean(clienteId)} titulo={cliente?.nome || 'Cliente'} subtitulo={cliente ? `${cliente.telefone} - Score ${cliente.score}` : 'Carregando dados do cliente.'} icon={Users} onClose={onClose} size="modalWide">
      {erro && <div className="errorBanner">{erro}</div>}
      {!dados && !erro && <div className="loadingLine">Carregando...</div>}
      {dados && (
        <>
          <div className="summaryStrip">
            <div><span>Operacoes abertas</span><b>{dados.resumo?.operacoesEmAberto || 0}</b></div>
            <div><span>Quitadas</span><b>{dados.resumo?.operacoesQuitadas || 0}</b></div>
            <div><span>Parcelas abertas</span><b>{dados.resumo?.parcelasEmAberto || 0}</b></div>
            <div><span>Saldo devedor</span><b>{moeda(dados.resumo?.saldoDevedor || 0)}</b></div>
            <div><span>Total pago</span><b>{moeda(dados.resumo?.totalPago || 0)}</b></div>
            <div><span>Lucro gerado</span><b>{moeda(dados.resumo?.lucroGerado || 0)}</b></div>
          </div>
          {acaoMsg && <div className="infoBanner">{acaoMsg}</div>}
          <div className="modalActions">
            <button className="primaryButton" onClick={() => onNovaOperacao?.(cliente)}><Plus size={16} /> Nova operacao</button>
            <button className="ghostButton" onClick={() => window.print()}><FileText size={16} /> Imprimir</button>
          </div>
          <div className="tabs">{abas.map((item) => <button key={item} className={aba === item ? 'active' : ''} onClick={() => setAba(item)}>{labelsAbas[item]}</button>)}</div>
          {aba === 'dados' && (
            <>
              <ScoreBar score={cliente.score} />
              <div className="previewBox tableWithTop">
                <div><span>Nome</span><b>{cliente.nome}</b></div>
                <div><span>CPF</span><b>{cliente.cpf || '-'}</b></div>
                <div><span>Telefone</span><b>{cliente.telefone}</b></div>
                <div><span>Endereco</span><b>{cliente.endereco || '-'}</b></div>
                <div><span>Cadastrado em</span><b>{dataCurta(cliente.criadoEm)}</b></div>
              </div>
            </>
          )}
          {aba === 'score' && (
            <div className="timeline">
              {(cliente.historicoScore || []).length === 0 && <span className="hint">Nenhuma movimentacao de score registrada.</span>}
              {(cliente.historicoScore || []).map((item) => (
                <div className="timelineItem" key={item.id}>
                  <b>{item.alteracao > 0 ? '+' : ''}{item.alteracao}</b>
                  <div>
                    <strong>{item.motivo}</strong>
                    <span>{dataCurta(item.data)} - score resultante {item.scoreResultante}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {aba === 'operacoes' && <SimpleTable cols={['Operacao', 'Valor', 'Juros', 'Parcelas', 'Status']} rows={(dados.operacoes?.todas || []).map((op) => [op.numeroOperacao, moeda(op.valor), `${op.juros}%`, `${op.totalParcelas}x`, <StatusBadge status={op.statusOperacao} />])} />}
          {aba === 'parcelas' && <SimpleTable cols={['Operacao', '#', 'Valor', 'Status', 'Vencimento', 'Acoes']} rows={(dados.parcelas || []).map((p) => {
            const pagamento = pagamentosPorParcela.get(p.id);
            return [p.numeroOperacao, p.numero, moeda(p.valor), <StatusBadge status={p.status} />, dataCurta(p.dataVencimento), pagamento ? <button className="smallButton" onClick={() => reenviarRecibo(pagamento.id)}>Reenviar recibo</button> : '-'];
          })} />}
          {aba === 'acordos' && (
            <div className="agreementsPanel">
              <form className="inlineForm" onSubmit={criarPromessa}>
                <select value={promessaForm.emprestimoId} onChange={(event) => setPromessaForm({ ...promessaForm, emprestimoId: event.target.value })} required>
                  <option value="">Operacao</option>
                  {(dados.operacoes?.emAberto || []).map((op) => <option key={op.id} value={op.id}>{op.numeroOperacao} - {moeda(op.valorTotal)}</option>)}
                </select>
                <input type="number" min="0.01" step="0.01" placeholder="Valor prometido" value={promessaForm.valor} onChange={(event) => setPromessaForm({ ...promessaForm, valor: event.target.value })} required />
                <input type="date" value={promessaForm.dataPrometida} onChange={(event) => setPromessaForm({ ...promessaForm, dataPrometida: event.target.value })} required />
                <input type="text" placeholder="Observacao" value={promessaForm.observacao} onChange={(event) => setPromessaForm({ ...promessaForm, observacao: event.target.value })} />
                <button className="primaryButton" type="submit">Registrar</button>
              </form>
              <SimpleTable cols={['Operacao', 'Valor', 'Data prometida', 'Status', 'Observacao', 'Acoes']} rows={(dados.promessas || []).map((p) => [p.numeroOperacao, moeda(p.valor), dataCurta(p.dataPrometida), <StatusBadge status={p.status} />, p.observacao || '-', <div className="rowActions"><button className="smallButton" onClick={() => atualizarPromessa(p.id, 'CUMPRIDA')}>Cumpriu</button><button className="smallButton" onClick={() => atualizarPromessa(p.id, 'NAO_CUMPRIDA')}>Nao cumpriu</button></div>])} />
            </div>
          )}
          {aba === 'contratos' && <SimpleTable cols={['Contrato', 'Operacao', 'Status', 'Criado']} rows={(dados.contratos || []).map((c) => [c.numeroContrato, c.numeroOperacao, <StatusBadge status={c.statusContrato} />, dataCurta(c.criadoEm)])} />}
          {aba === 'documentos' && (
            <>
              <div className="docUploadGrid">
                <label><Upload size={16} /> RG frente<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => enviarDocumento('RG_FRENTE', event.target.files?.[0])} /></label>
                <label><Upload size={16} /> RG verso<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => enviarDocumento('RG_VERSO', event.target.files?.[0])} /></label>
                <label><Home size={16} /> Comprovante<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => enviarDocumento('COMPROVANTE_ENDERECO', event.target.files?.[0])} /></label>
              </div>
              {uploadErro && <span className="formError">{uploadErro}</span>}
              <div className="miniTable">
                <table>
                  <thead><tr><th>Tipo</th><th>Arquivo</th><th>Status</th><th>Criado</th><th>Acoes</th></tr></thead>
                  <tbody>
                    {(dados.documentos || []).length === 0 && <tr><td colSpan="5">Nenhum documento anexado.</td></tr>}
                    {(dados.documentos || []).map((d) => (
                      <tr key={d.id}>
                        <td>{d.tipoDocumento}</td>
                        <td>{d.nomeOriginal}</td>
                        <td><StatusBadge status={d.statusValidacao} /></td>
                        <td>{dataCurta(d.criadoEm)}</td>
                        <td className="rowActions"><button className="dangerButton" onClick={() => excluirDocumento(d.id)}><Trash2 size={16} /> Excluir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export function SimpleTable({ cols, rows }) {
  return (
    <div className="miniTable">
      <table>
        <thead><tr>{cols.map((col) => <th key={col}>{col}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length}>Nenhum registro.</td></tr>}
          {rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}


