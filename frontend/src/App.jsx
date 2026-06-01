import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  Check,
  CircleDollarSign,
  ClipboardList,
  Eye,
  FileText,
  Home,
  PackagePlus,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  Upload,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ScoreBar, SortTh, StatusBadge } from './components/common.jsx';
import { GlobalSearch, Login, Modal, PageHeader, SearchBox, Shell, Stat, ToastStack } from './components/layout.jsx';
import { ClienteDetalheModal, ConfirmacaoModal, ExclusaoModal, ObservacaoModal, PagamentoModal, ParcelasModal, ProdutoExclusaoModal, RenegociacaoModal } from './components/modals.jsx';
import { useOrdenacao } from './hooks/useOrdenacao.js';
import { api, apiUpload } from './lib/api.js';
import { CONFIG_PADRAO, JUROS_NORMAL_VENDA, TIPOS } from './lib/constants.js';
import { calcularParcelas, operacaoPendente } from './lib/finance.js';
import { dataCurta, moeda } from './lib/format.js';
import { Configuracoes, RelatorioVendas, Relatorios } from './pages/reports.jsx';

function Painel({ dados, resumoVendas, recarregar }) {
  const [visao, setVisao] = useState('financeiro');
  const faturamentoVendas = Object.values(resumoVendas?.porTipo || {}).reduce((acc, item) => acc + item.faturamento, 0);
  const lucroVendas = Object.values(resumoVendas?.porTipo || {}).reduce((acc, item) => acc + item.lucro, 0);
  const alertas = dados.alertas || {};
  const financeiro = dados.financeiro?.resumo || {};
  const ultimasFinanceiro = dados.financeiro?.ultimasOperacoes || [];
  const operacoesPendentes = dados.emprestimos.filter(operacaoPendente);
  const operacoesAtrasadas = dados.emprestimos.filter((item) => item.statusOperacao === 'ATRASADO' || item.status === 'atrasado');
  const aguardandoAceite = dados.emprestimos.filter((item) => item.statusOperacao === 'AGUARDANDO_ACEITE');
  const aguardandoLiberacao = dados.emprestimos.filter((item) => item.statusOperacao === 'APROVADO');
  const carteiraAberta = financeiro.valorEmAberto ?? operacoesPendentes.reduce((acc, item) => acc + Number(item.saldoDevedor || item.valorTotal || 0), 0);
  const vendasPorTipo = TIPOS.map((tipo) => ({ tipo, dados: resumoVendas?.porTipo?.[tipo.id] || {} }));
  const ultimasOperacoes = (ultimasFinanceiro.length ? ultimasFinanceiro : [...dados.emprestimos]
    .sort((a, b) => new Date(b.criadoEm || b.dataCriacao || 0) - new Date(a.criadoEm || a.dataCriacao || 0))
    .slice(0, 5));

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle="Central de comando da operacao."
        action={<button className="iconButton" onClick={recarregar} title="Atualizar"><RefreshCw size={18} /></button>}
      />
      <div className="commandTabs" role="tablist" aria-label="Visao do painel">
        <button className={visao === 'financeiro' ? 'active' : ''} type="button" onClick={() => setVisao('financeiro')}>
          <BadgeDollarSign size={17} /> Operacoes financeiras
        </button>
        <button className={visao === 'vendas' ? 'active' : ''} type="button" onClick={() => setVisao('vendas')}>
          <PackagePlus size={17} /> Vendas e estoque
        </button>
      </div>

      {visao === 'financeiro' ? (
        <div className="commandCenter">
          <section className="ownerDashboard">
            <article className="ledgerPanel">
              <div className="ledgerTop">
                <span>Dinheiro colocado na rua</span>
                <BadgeDollarSign size={22} />
              </div>
              <strong>{moeda(financeiro.totalColocadoRua || 0)}</strong>
              <p>Total principal efetivamente liberado em operacoes de credito.</p>
              <div className="ledgerStats">
                <div><span>Total contratado</span><b>{moeda(financeiro.totalContratado || 0)}</b></div>
                <div><span>Em aberto</span><b>{moeda(carteiraAberta || 0)}</b></div>
                <div><span>Juros a receber</span><b>{moeda(financeiro.jurosAReceber || 0)}</b></div>
              </div>
            </article>

            <aside className="moneySnapshot">
              <div className="moneyTile received"><span>Recebido</span><strong>{moeda(financeiro.totalRecebido || 0)}</strong><small>Pagamentos confirmados</small></div>
              <div className="moneyTile profit"><span>Lucro gerado</span><strong>{moeda(financeiro.lucroRecebido || 0)}</strong><small>Juros ja recebidos</small></div>
              <div className="moneyTile overdue"><span>Em atraso</span><strong>{moeda(financeiro.valorAtrasado || 0)}</strong><small>{financeiro.parcelasAtrasadas || 0} parcela(s)</small></div>
              <div className="moneyTile open"><span>Falta receber</span><strong>{moeda(carteiraAberta || 0)}</strong><small>{financeiro.operacoesAtivas || 0} operacao(oes)</small></div>
            </aside>
          </section>

          <section className="operationWorkbench">
            <article className="panel">
              <div className="panelTitle">Situacao operacional</div>
              <div className="queueGrid">
                <div><ClipboardList size={18} /><span>Vencendo hoje</span><strong>{alertas.vencendoHoje || 0}</strong></div>
                <div><RefreshCw size={18} /><span>Vencendo amanha</span><strong>{alertas.vencendoAmanha || 0}</strong></div>
                <div><BadgeDollarSign size={18} /><span>Aguardando aceite</span><strong>{financeiro.aguardandoAceite ?? aguardandoAceite.length}</strong></div>
                <div><Check size={18} /><span>Aprovadas para liberar</span><strong>{financeiro.aguardandoLiberacao ?? aguardandoLiberacao.length}</strong></div>
              </div>
            </article>

            <article className="panel operationPreview">
              <div className="panelTitle">Ultimas operacoes</div>
              <div className="compactTable">
                {ultimasOperacoes.length === 0 && <span className="hint">Nenhuma operacao cadastrada.</span>}
                {ultimasOperacoes.map((item) => (
                  <div className="compactRow" key={item.id}>
                    <div>
                      <strong>{item.numeroOperacao || '-'}</strong>
                      <span>{item.cliente?.nome || item.cliente || 'Cliente nao informado'}</span>
                    </div>
                    <b>{moeda(item.valorTotal || item.valor || 0)}</b>
                    <StatusBadge status={item.statusOperacao || item.status} />
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      ) : (
        <div className="commandCenter">
          <section className="salesCommand">
            <article className="ledgerPanel salesLedger">
              <div className="ledgerTop">
                <span>Receita de vendas</span>
                <CircleDollarSign size={22} />
              </div>
              <strong>{moeda(faturamentoVendas)}</strong>
              <p>{resumoVendas?.totalProdutos || 0} produtos disponiveis para venda.</p>
              <div className="ledgerStats">
                <div><span>Lucro</span><b>{moeda(lucroVendas)}</b></div>
                <div><span>Modulos</span><b>3</b></div>
                <div><span>Juros</span><b>{JUROS_NORMAL_VENDA}%</b></div>
              </div>
            </article>

            <div className="salesLanes">
              {vendasPorTipo.map(({ tipo, dados: item }) => {
                const Icon = tipo.icon;
                return (
                  <article className="salesLane" key={tipo.id}>
                    <Icon size={20} />
                    <span>{tipo.label}</span>
                    <strong>{moeda(item.faturamento || 0)}</strong>
                    <small>{item.estoque || 0} em estoque | lucro {moeda(item.lucro || 0)}</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="operationWorkbench">
            <article className="panel">
              <div className="panelTitle">Estoque por modulo</div>
              <div className="queueGrid">
                {vendasPorTipo.map(({ tipo, dados: item }) => {
                  const Icon = tipo.icon;
                  return <div key={tipo.id}><Icon size={18} /><span>{tipo.label}</span><strong>{item.estoque || 0}</strong></div>;
                })}
              </div>
            </article>
            <article className="panel">
              <div className="panelTitle">Resultado por modulo</div>
              <div className="dashboardList">
                {vendasPorTipo.map(({ tipo, dados: item }) => (
                  <div key={tipo.id}><span>{tipo.label}</span><strong>{moeda(item.lucro || 0)}</strong></div>
                ))}
              </div>
            </article>
          </section>
        </div>
      )}
    </>
  );
}

function TarefasHoje({ emprestimos, abrirPagar, aceitarManual, liberarDinheiro, reenviarPix }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(hoje);
  fimHoje.setHours(23, 59, 59, 999);
  const vencendoHoje = emprestimos.filter((item) => operacaoPendente(item) && new Date(item.dataVencimento) >= hoje && new Date(item.dataVencimento) <= fimHoje);
  const atrasados = emprestimos.filter((item) => item.statusOperacao === 'ATRASADO' || item.status === 'atrasado' || (operacaoPendente(item) && new Date(item.dataVencimento) < hoje));
  const aguardandoAceite = emprestimos.filter((item) => item.statusOperacao === 'AGUARDANDO_ACEITE');
  const aprovadas = emprestimos.filter((item) => item.statusOperacao === 'APROVADO');
  const secoes = [
    ['Vencendo hoje', vencendoHoje],
    ['Em atraso', atrasados],
    ['Aguardando aceite', aguardandoAceite],
    ['Aprovadas para liberar', aprovadas],
  ];

  return (
    <>
      <PageHeader title="Para fazer hoje" subtitle="Pendencias operacionais do dia" />
      <section className="contentGrid">
        {secoes.map(([titulo, lista]) => (
          <article className="panel" key={titulo}>
            <div className="panelTitle">{titulo}</div>
            <div className="moduleRows">
              {lista.length === 0 && <span className="hint">Nada pendente.</span>}
              {lista.map((item) => (
                <div className="moduleRow" key={item.id}>
                  <BadgeDollarSign size={20} />
                  <div><strong>{item.cliente?.nome || '-'}</strong><span>{item.numeroOperacao} - {moeda(item.valorTotal)} - {dataCurta(item.dataVencimento)}</span></div>
                  <div className="rowActions">
                    {operacaoPendente(item) && <button className="smallButton" onClick={() => abrirPagar(item)}>Pagar</button>}
                    {item.statusOperacao === 'AGUARDANDO_ACEITE' && <button className="smallButton" onClick={() => aceitarManual(item)}>Aceitar</button>}
                    {item.statusOperacao === 'APROVADO' && <button className="smallButton" onClick={() => liberarDinheiro(item)}>Liberar</button>}
                    <button className="iconButton" onClick={() => reenviarPix(item)} title="Reenviar Pix"><CircleDollarSign size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function ClienteForm({ onSalvar, onUnauthorized }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', endereco: '' });
  const [arquivos, setArquivos] = useState({ rgFrente: null, rgVerso: null, comprovante: null });
  const [erro, setErro] = useState('');

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onSalvar(form, arquivos);
      setForm({ nome: '', cpf: '', telefone: '', endereco: '' });
      setArquivos({ rgFrente: null, rgVerso: null, comprovante: null });
      setAberto(false);
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized?.();
        return;
      }
      setErro(error.message);
    }
  }

  return (
    <>
      <button className="primaryButton" onClick={() => setAberto(true)}><Plus size={17} /> Novo cliente</button>
      <Modal aberto={aberto} titulo="Novo cliente" subtitulo="Preencha os dados para cadastrar." icon={Users} onClose={() => setAberto(false)}>
        <form className="modalForm" onSubmit={salvar}>
          <label>Nome completo *</label>
          <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex: Joao Silva" required />
          <div className="formGrid">
            <div>
              <label>CPF *</label>
              <input value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} placeholder="000.000.000-00" required />
            </div>
            <div>
              <label>Telefone (WhatsApp) *</label>
              <input value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} placeholder="Ex: 11999999999" required />
            </div>
          </div>
          <label>Endereco *</label>
          <input value={form.endereco} onChange={(event) => setForm({ ...form, endereco: event.target.value })} placeholder="Rua, numero, bairro, cidade" required />
          <div className="optionalDocs">
            <div>
              <label>RG frente</label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setArquivos({ ...arquivos, rgFrente: event.target.files?.[0] || null })} />
            </div>
            <div>
              <label>RG verso</label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setArquivos({ ...arquivos, rgVerso: event.target.files?.[0] || null })} />
            </div>
            <div>
              <label>Comprovante de residencia</label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setArquivos({ ...arquivos, comprovante: event.target.files?.[0] || null })} />
            </div>
          </div>
          <span className="hint">Documentos opcionais. Aceita JPG, PNG ou PDF ate 5MB.</span>
          {erro && <span className="formError">{erro}</span>}
          <div className="modalActions">
            <button className="ghostButton" type="button" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="primaryButton" type="submit"><Check size={16} /> Cadastrar</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Clientes({ clientes, salvarCliente, excluirCliente, verCliente, onUnauthorized, filtros, setFiltros, paginacao }) {
  const [busca, setBusca] = useState(filtros.busca || '');
  const filtrados = clientes.filter((cliente) => `${cliente.nome} ${cliente.cpf || ''} ${cliente.telefone} ${cliente.endereco || ''}`.toLowerCase().includes(busca.toLowerCase()));
  const camposOrdenacao = useMemo(() => ({
    nome: (cliente) => cliente.nome,
    cpf: (cliente) => cliente.cpf,
    telefone: (cliente) => cliente.telefone,
    endereco: (cliente) => cliente.endereco,
    score: (cliente) => Number(cliente.score || 0),
    operacoes: (cliente) => cliente.emprestimos?.length || 0,
  }), []);
  const { ordenados, ordem, ordenar } = useOrdenacao(filtrados, camposOrdenacao, { campo: 'nome', direcao: 'asc' });
  useEffect(() => {
    const id = setTimeout(() => setFiltros({ ...filtros, busca, page: 1 }), 350);
    return () => clearTimeout(id);
  }, [busca]);
  return (
    <>
      <PageHeader title="Clientes" subtitle="Base herdada da V1" action={<ClienteForm onSalvar={salvarCliente} onUnauthorized={onUnauthorized} />} />
      <SearchBox value={busca} onChange={setBusca} />
      <div className="tablePanel">
        <table className="responsiveTable">
          <thead><tr>
            <SortTh campo="nome" ordem={ordem} ordenar={ordenar}>Nome</SortTh>
            <SortTh campo="cpf" ordem={ordem} ordenar={ordenar}>CPF</SortTh>
            <SortTh campo="telefone" ordem={ordem} ordenar={ordenar}>Telefone</SortTh>
            <SortTh campo="endereco" ordem={ordem} ordenar={ordenar}>Endereco</SortTh>
            <SortTh campo="score" ordem={ordem} ordenar={ordenar}>Score</SortTh>
            <SortTh campo="operacoes" ordem={ordem} ordenar={ordenar}>Operacoes abertas</SortTh>
            <th>Acoes</th>
          </tr></thead>
          <tbody>{ordenados.map((cliente) => (
            <tr key={cliente.id}>
              <td data-label="Nome">{cliente.nome}</td>
              <td data-label="CPF">{cliente.cpf || '-'}</td>
              <td data-label="Telefone">{cliente.telefone}</td>
              <td data-label="Endereco" className="tdLimit">{cliente.endereco || '-'}</td>
              <td data-label="Score"><ScoreBar score={cliente.score} /></td>
              <td data-label="Operacoes abertas">{cliente.emprestimos?.length || 0}</td>
              <td data-label="Acoes" className="rowActions">
                <button className="iconButton" onClick={() => verCliente(cliente.id)} title="Detalhes"><Eye size={16} /></button>
                <button className="dangerButton" onClick={() => excluirCliente(cliente)} title="Excluir"><Trash2 size={16} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="modalActions">
        <span className="hint">Pagina {paginacao.page} de {paginacao.totalPages} - {paginacao.total} clientes</span>
        <button className="ghostButton" disabled={paginacao.page <= 1} onClick={() => setFiltros({ ...filtros, page: paginacao.page - 1 })}>Anterior</button>
        <button className="ghostButton" disabled={paginacao.page >= paginacao.totalPages} onClick={() => setFiltros({ ...filtros, page: paginacao.page + 1 })}>Proxima</button>
      </div>
    </>
  );
}

function CreditoForm({ clientes, onSalvar, clienteInicial = '', configuracoes = CONFIG_PADRAO }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    clienteId: clienteInicial,
    valor: '',
    juros: configuracoes.jurosCreditoPadrao || CONFIG_PADRAO.jurosCreditoPadrao,
    diasParaVencer: configuracoes.diasParaVencerPadrao || CONFIG_PADRAO.diasParaVencerPadrao,
    totalParcelas: configuracoes.parcelasCreditoPadrao || CONFIG_PADRAO.parcelasCreditoPadrao,
  });
  const [erro, setErro] = useState('');
  const parcelas = calcularParcelas(form.valor, form.juros, form.totalParcelas);
  const total = parcelas.reduce((acc, item) => acc + item.valor, 0);
  const clienteSelecionado = clientes.find((cliente) => cliente.id === form.clienteId);

  useEffect(() => {
    if (clienteInicial && typeof clienteInicial === 'string') setForm((atual) => ({ ...atual, clienteId: clienteInicial }));
    if (clienteInicial && typeof clienteInicial === 'object') {
      setForm((atual) => ({
        ...atual,
        clienteId: clienteInicial.clienteId || '',
        valor: clienteInicial.valor || '',
        juros: clienteInicial.juros || atual.juros,
        totalParcelas: clienteInicial.totalParcelas || atual.totalParcelas,
        diasParaVencer: clienteInicial.diasParaVencer || atual.diasParaVencer,
      }));
      setAberto(true);
    }
  }, [clienteInicial]);

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onSalvar(form);
      setForm({
        clienteId: '',
        valor: '',
        juros: configuracoes.jurosCreditoPadrao || CONFIG_PADRAO.jurosCreditoPadrao,
        diasParaVencer: configuracoes.diasParaVencerPadrao || CONFIG_PADRAO.diasParaVencerPadrao,
        totalParcelas: configuracoes.parcelasCreditoPadrao || CONFIG_PADRAO.parcelasCreditoPadrao,
      });
      setAberto(false);
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <>
      <button className="primaryButton" onClick={() => setAberto(true)}><Plus size={17} /> Nova operacao</button>
      <Modal aberto={aberto} titulo="Novo emprestimo" subtitulo="Configure o emprestimo e escolha o cliente." icon={BadgeDollarSign} onClose={() => setAberto(false)} size="modalLarge">
        <form className="modalForm" onSubmit={salvar}>
          <label>Cliente *</label>
          <select value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })} required>
            <option value="">Selecione um cliente...</option>
            {clientes.map((cliente) => <option value={cliente.id} key={cliente.id}>{cliente.nome} - {cliente.telefone}</option>)}
          </select>
          {clienteSelecionado && clienteSelecionado.score < 80 && (
            <div className="warningBox">Cliente com risco {clienteSelecionado.score < 50 ? 'alto' : 'medio'} - score {clienteSelecionado.score}.</div>
          )}
          <div className="formGrid">
            <div><label>Valor principal *</label><input value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} placeholder="0,00" type="number" min="10" step="0.01" required /></div>
            <div><label>Juros (%) *</label><input value={form.juros} onChange={(event) => setForm({ ...form, juros: event.target.value })} placeholder="20" type="number" min="0" max="100" step="0.01" required /></div>
          </div>
          <div className="formGrid">
            <div><label>Dias para vencer</label><input value={form.diasParaVencer} onChange={(event) => setForm({ ...form, diasParaVencer: event.target.value })} type="number" min="1" max="365" /></div>
            <div><label>Numero de parcelas</label><input value={form.totalParcelas} onChange={(event) => setForm({ ...form, totalParcelas: event.target.value })} type="number" min="1" max="60" /></div>
          </div>
          <div className="previewBox">
            <div><span>Principal</span><b>{moeda(form.valor)}</b></div>
            <div><span>Total a pagar</span><b>{moeda(total)}</b></div>
            <div><span>Parcelamento</span><b>{Number(form.totalParcelas || 1) === 1 ? 'A vista' : `${form.totalParcelas} parcelas variaveis`}</b></div>
            <div><span>Cliente</span><b>{clienteSelecionado?.nome || '-'}</b></div>
          </div>
          {Number(form.totalParcelas || 1) > 1 && (
            <div className="miniTable">
              <table><thead><tr><th>#</th><th>Valor</th><th>Vencimento</th><th>Saldo depois</th></tr></thead><tbody>{parcelas.map((parcela) => (
                <tr key={parcela.numero}><td>{parcela.numero}</td><td>{moeda(parcela.valor)}</td><td>{dataCurta(parcela.vencimento)}</td><td>{moeda(parcela.saldoDepois)}</td></tr>
              ))}</tbody></table>
            </div>
          )}
          {erro && <span className="formError">{erro}</span>}
          <div className="modalActions">
            <button className="ghostButton" type="button" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="primaryButton" type="submit"><Check size={16} /> Criar emprestimo</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Credito({ emprestimos, clientes, salvarCredito, abrirPagar, abrirParcelas, excluirEmprestimo, filtros, setFiltros, paginacao, aceitarManual, liberarDinheiro, reenviarContrato, reenviarPix, atualizarObservacao, pagarProximaParcela, renegociarPrazo, cobrarLote, clienteInicial, configuracoes }) {
  const [selecionados, setSelecionados] = useState([]);
  const camposOrdenacao = useMemo(() => ({
    operacao: (item) => item.numeroOperacao,
    cliente: (item) => item.cliente?.nome || '',
    valor: (item) => Number(item.valor || 0),
    total: (item) => Number(item.valorTotal || 0),
    parcelas: (item) => Number(item.totalParcelas || 1),
    vencimento: (item) => item.dataVencimento,
    status: (item) => item.statusOperacao || item.status,
  }), []);
  const { ordenados, ordem, ordenar } = useOrdenacao(emprestimos, camposOrdenacao, { campo: 'vencimento', direcao: 'asc' });
  function alterarFiltro(campo, valor) {
    setFiltros({ ...filtros, [campo]: valor, page: 1 });
  }
  function alternar(id) {
    setSelecionados((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }

  return (
    <>
      <PageHeader title="Credito" subtitle="Operacoes financeiras da V1 preservadas" action={<CreditoForm clientes={clientes} onSalvar={salvarCredito} clienteInicial={clienteInicial} configuracoes={configuracoes} />} />
      <div className="inlineForm tableWithTop">
        <input value={filtros.busca} onChange={(event) => alterarFiltro('busca', event.target.value)} placeholder="Buscar cliente, telefone ou operacao" />
        <select value={filtros.statusOperacao} onChange={(event) => alterarFiltro('statusOperacao', event.target.value)}>
          <option value="">Todos os status</option>
          {['AGUARDANDO_ACEITE', 'APROVADO', 'LIBERADO', 'EM_DIA', 'ATRASADO', 'QUITADO', 'CANCELADO', 'RECUSADO'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
        </select>
        <input value={filtros.inicio} onChange={(event) => alterarFiltro('inicio', event.target.value)} type="date" />
        <input value={filtros.fim} onChange={(event) => alterarFiltro('fim', event.target.value)} type="date" />
      </div>
      {selecionados.length > 0 && (
        <div className="modalActions">
          <span className="hint">{selecionados.length} selecionada(s)</span>
          <button className="primaryButton" onClick={() => { cobrarLote(selecionados); setSelecionados([]); }}>Cobrar WhatsApp</button>
        </div>
      )}
      <div className="tablePanel">
        <table className="responsiveTable">
          <thead><tr>
            <th></th>
            <SortTh campo="operacao" ordem={ordem} ordenar={ordenar}>Operacao</SortTh>
            <SortTh campo="cliente" ordem={ordem} ordenar={ordenar}>Cliente</SortTh>
            <SortTh campo="valor" ordem={ordem} ordenar={ordenar}>Valor</SortTh>
            <SortTh campo="total" ordem={ordem} ordenar={ordenar}>Total</SortTh>
            <SortTh campo="parcelas" ordem={ordem} ordenar={ordenar}>Parcelas</SortTh>
            <SortTh campo="vencimento" ordem={ordem} ordenar={ordenar}>Vencimento</SortTh>
            <SortTh campo="status" ordem={ordem} ordenar={ordenar}>Status</SortTh>
            <th>Acoes</th>
          </tr></thead>
          <tbody>{ordenados.map((item) => (
            <tr key={item.id} className={item.statusOperacao === 'ATRASADO' ? 'rowOverdue' : ''}>
              <td data-label="Selecionar"><input type="checkbox" checked={selecionados.includes(item.id)} onChange={() => alternar(item.id)} /></td>
              <td data-label="Operacao">{item.numeroOperacao}</td>
              <td data-label="Cliente">{item.cliente?.nome || '-'}</td>
              <td data-label="Valor">{moeda(item.valor)}</td>
              <td data-label="Total">{moeda(item.valorTotal)}</td>
              <td data-label="Parcelas">{item.totalParcelas || 1}x</td>
              <td data-label="Vencimento">{dataCurta(item.dataVencimento)}</td>
              <td data-label="Status"><StatusBadge status={item.statusOperacao || item.status} /></td>
              <td data-label="Acoes" className="rowActions">
                <button className="smallButton" onClick={() => abrirParcelas(item)}>Parcelas</button>
                {operacaoPendente(item) && <button className="smallButton" onClick={() => abrirPagar(item)}>Pagar</button>}
                {operacaoPendente(item) && <button className="smallButton" onClick={() => pagarProximaParcela(item)}>Pagar prox.</button>}
                {item.statusOperacao === 'AGUARDANDO_ACEITE' && <button className="smallButton" onClick={() => aceitarManual(item)}>Aceitar</button>}
                {item.statusOperacao === 'APROVADO' && <button className="smallButton" onClick={() => liberarDinheiro(item)}>Liberar</button>}
                <button className="iconButton" onClick={() => reenviarContrato(item)} title="Reenviar contrato"><FileText size={16} /></button>
                <button className="iconButton" onClick={() => reenviarPix(item)} title="Reenviar Pix"><CircleDollarSign size={16} /></button>
                <button className="iconButton" onClick={() => renegociarPrazo(item)} title="Renegociar prazo"><RefreshCw size={16} /></button>
                <button className="iconButton" onClick={() => atualizarObservacao(item)} title="Observacao"><ClipboardList size={16} /></button>
                <button className="dangerButton" onClick={() => excluirEmprestimo(item)} title="Excluir"><Trash2 size={16} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="modalActions">
        <span className="hint">Pagina {paginacao.page} de {paginacao.totalPages} - {paginacao.total} registros</span>
        <button className="ghostButton" disabled={paginacao.page <= 1} onClick={() => setFiltros({ ...filtros, page: paginacao.page - 1 })}>Anterior</button>
        <button className="ghostButton" disabled={paginacao.page >= paginacao.totalPages} onClick={() => setFiltros({ ...filtros, page: paginacao.page + 1 })}>Proxima</button>
      </div>
    </>
  );
}

function dataInputDepoisDias(dias = 30) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function Orcamentos({ clientes, configuracoes, notificar, converterOrcamento, excluirOrcamento, refreshKey = 0 }) {
  const [buscaCliente, setBuscaCliente] = useState('');
  const [form, setForm] = useState({
    clienteId: '',
    valor: '',
    juros: configuracoes.jurosCreditoPadrao || CONFIG_PADRAO.jurosCreditoPadrao,
    parcelas: configuracoes.parcelasCreditoPadrao || CONFIG_PADRAO.parcelasCreditoPadrao,
    primeiroVencimento: dataInputDepoisDias(configuracoes.diasParaVencerPadrao || CONFIG_PADRAO.diasParaVencerPadrao),
  });
  const [orcamentos, setOrcamentos] = useState([]);
  const [erro, setErro] = useState('');
  const parcelas = calcularParcelas(form.valor, form.juros, form.parcelas, form.primeiroVencimento);
  const total = parcelas.reduce((acc, item) => Number((acc + item.valor).toFixed(2)), 0);
  const jurosTotal = parcelas.reduce((acc, item) => Number((acc + item.valorJuros).toFixed(2)), 0);
  const clienteSelecionado = clientes.find((cliente) => cliente.id === form.clienteId);
  const clientesFiltrados = clientes.filter((cliente) => `${cliente.nome} ${cliente.telefone} ${cliente.cpf || ''}`.toLowerCase().includes(buscaCliente.toLowerCase()));

  async function carregarOrcamentos() {
    try {
      const resposta = await api('/orcamentos');
      setOrcamentos(resposta.orcamentos || []);
    } catch (error) {
      setErro(error.message);
    }
  }

  useEffect(() => { carregarOrcamentos(); }, [refreshKey]);

  async function gerarPdf(event) {
    event.preventDefault();
    setErro('');
    try {
      await api('/orcamentos', { method: 'POST', body: JSON.stringify(form) });
      await carregarOrcamentos();
      notificar('sucesso', 'Orcamento gerado e salvo em PDF.');
    } catch (error) {
      setErro(error.message);
      notificar('erro', error.message);
    }
  }

  async function enviar(orcamento) {
    try {
      await api(`/orcamentos/${orcamento.id}/enviar`, { method: 'POST', body: JSON.stringify({}) });
      notificar('sucesso', 'Orcamento enviado pelo WhatsApp.');
    } catch (error) {
      notificar('erro', error.message);
    }
  }

  async function reabrir(orcamento) {
    const resposta = await api(`/orcamentos/${orcamento.id}`);
    const item = resposta.orcamento;
    setForm({
      clienteId: item.clienteId || '',
      valor: item.valor,
      juros: item.juros,
      parcelas: item.parcelas,
      primeiroVencimento: item.primeiroVencimento.slice(0, 10),
    });
    notificar('sucesso', 'Orcamento reaberto para edicao.');
  }

  async function converter(orcamento) {
    try {
      const resposta = await api(`/orcamentos/${orcamento.id}/converter`, { method: 'POST', body: JSON.stringify({}) });
      converterOrcamento(resposta.orcamento);
    } catch (error) {
      notificar('erro', error.message);
    }
  }

  return (
    <>
      <PageHeader title="Orcamento" subtitle="Simule credito, gere PDF e converta em operacao" />
      {erro && <div className="errorBanner">{erro}</div>}
      <section className="contentGrid">
        <article className="panel">
          <div className="panelTitle">Nova simulacao</div>
          <form className="modalForm" onSubmit={gerarPdf}>
            <label>Cliente</label>
            <input value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} placeholder="Buscar cliente por nome, CPF ou telefone" />
            <select value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })}>
              <option value="">Simulacao sem cliente</option>
              {clientesFiltrados.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome} - {cliente.telefone}</option>)}
            </select>
            <div className="formGrid">
              <div><label>Valor do emprestimo</label><input type="number" min="0.01" step="0.01" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required /></div>
              <div><label>Taxa de juros (%)</label><input type="number" min="0" step="0.01" value={form.juros} onChange={(event) => setForm({ ...form, juros: event.target.value })} required /></div>
            </div>
            <div className="formGrid">
              <div><label>Parcelas</label><input type="number" min="1" max="120" value={form.parcelas} onChange={(event) => setForm({ ...form, parcelas: event.target.value })} required /></div>
              <div><label>Primeiro vencimento</label><input type="date" value={form.primeiroVencimento} onChange={(event) => setForm({ ...form, primeiroVencimento: event.target.value })} required /></div>
            </div>
            <div className="modalActions">
              <button className="primaryButton" type="submit"><FileText size={16} /> Gerar e salvar PDF</button>
              <button className="ghostButton" type="button" onClick={() => converterOrcamento({ ...form, cliente: clienteSelecionado, status: 'PENDENTE' })}>Converter em operacao</button>
            </div>
          </form>
        </article>
        <article className="panel">
          <div className="panelTitle">Resumo instantaneo</div>
          <div className="previewBox">
            <div><span>Valor emprestado</span><b>{moeda(form.valor)}</b></div>
            <div><span>Total de juros</span><b>{moeda(jurosTotal)}</b></div>
            <div><span>Total a pagar</span><b>{moeda(total)}</b></div>
            <div><span>Cliente</span><b>{clienteSelecionado?.nome || 'Sem cliente'}</b></div>
          </div>
        </article>
      </section>
      <div className="tablePanel tableWithTop">
        <table className="responsiveTable">
          <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Juros</th><th>Amortizacao</th><th>Saldo devedor</th></tr></thead>
          <tbody>{parcelas.map((parcela) => (
            <tr key={parcela.numero}>
              <td data-label="#">{parcela.numero}</td>
              <td data-label="Vencimento">{dataCurta(parcela.vencimento)}</td>
              <td data-label="Valor">{moeda(parcela.valor)}</td>
              <td data-label="Juros">{moeda(parcela.valorJuros)}</td>
              <td data-label="Amortizacao">{moeda(parcela.amortizacao)}</td>
              <td data-label="Saldo devedor">{moeda(parcela.saldoDepois)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="tablePanel tableWithTop">
        <div className="panelTitle">Historico de orcamentos</div>
        <table className="responsiveTable">
          <thead><tr><th>Cliente</th><th>Valor</th><th>Parcelas</th><th>Status</th><th>Data</th><th>PDF</th><th>Acoes</th></tr></thead>
          <tbody>
            {orcamentos.length === 0 && <tr><td colSpan="7">Nenhum orcamento salvo.</td></tr>}
            {orcamentos.map((orcamento) => (
              <tr key={orcamento.id}>
                <td data-label="Cliente">{orcamento.cliente?.nome || 'Sem cliente'}</td>
                <td data-label="Valor">{moeda(orcamento.valor)}</td>
                <td data-label="Parcelas">{orcamento.parcelas}</td>
                <td data-label="Status"><StatusBadge status={orcamento.status} /></td>
                <td data-label="Data">{dataCurta(orcamento.criadoEm)}</td>
                <td data-label="PDF" className="tdLimit">{orcamento.caminhoPdf || '-'}</td>
                <td data-label="Acoes" className="rowActions">
                  <button className="smallButton" onClick={() => reabrir(orcamento)}>Reabrir</button>
                  <button className="smallButton" disabled={!orcamento.clienteId || orcamento.status !== 'PENDENTE'} onClick={() => enviar(orcamento)}>Enviar</button>
                  <button className="smallButton" disabled={orcamento.status !== 'PENDENTE'} onClick={() => converter(orcamento)}>Converter</button>
                  <button className="dangerButton" onClick={() => excluirOrcamento(orcamento)} title="Excluir orcamento"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function configProduto(tipo) {
  const mapa = {
    CARRO: {
      titulo: 'Cadastrar carro',
      exemplo: 'Ex: Chevrolet Onix LT 2020',
      marca: 'Chevrolet',
      modelo: 'Onix LT',
      identificador: 'Placa ou chassi',
      identificadorPlaceholder: 'ABC1D23 ou chassi',
    },
    MOTO: {
      titulo: 'Cadastrar moto',
      exemplo: 'Ex: Honda CG 160 2022',
      marca: 'Honda',
      modelo: 'CG 160',
      identificador: 'Placa ou chassi',
      identificadorPlaceholder: 'ABC1D23 ou chassi',
    },
    CELULAR: {
      titulo: 'Cadastrar celular',
      exemplo: 'Ex: iPhone 13 128GB',
      marca: 'Apple',
      modelo: 'iPhone 13',
      identificador: 'IMEI ou numero de serie',
      identificadorPlaceholder: 'IMEI ou serial',
    },
  };
  return mapa[tipo] || mapa.CARRO;
}

function ProdutoForm({ tipo, onSalvar }) {
  const cfg = configProduto(tipo);
  const [form, setForm] = useState({ tipo, titulo: '', marca: '', modelo: '', ano: '', identificador: '', valorCusto: '', valorVenda: '' });
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);

  function setCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    try {
      await onSalvar({ ...form, tipo });
      setForm({ tipo, titulo: '', marca: '', modelo: '', ano: '', identificador: '', valorCusto: '', valorVenda: '' });
      setAberto(false);
    } catch (error) {
      setErro(error.message);
    }
  }

  return (
    <>
      <button className="primaryButton" onClick={() => setAberto(true)}><Plus size={17} /> {cfg.titulo}</button>
      <Modal aberto={aberto} titulo={cfg.titulo} subtitulo="Cadastre dados de estoque e preco base de venda." icon={PackagePlus} onClose={() => setAberto(false)} size="modalLarge">
        <form className="modalForm" onSubmit={salvar}>
          <label>Titulo *</label>
          <input value={form.titulo} onChange={(event) => setCampo('titulo', event.target.value)} placeholder={cfg.exemplo} required />
          <div className="formGrid">
            <div><label>Marca</label><input value={form.marca} onChange={(event) => setCampo('marca', event.target.value)} placeholder={cfg.marca} /></div>
            <div><label>Modelo</label><input value={form.modelo} onChange={(event) => setCampo('modelo', event.target.value)} placeholder={cfg.modelo} /></div>
          </div>
          <div className="formGrid">
            <div><label>Ano</label><input value={form.ano} onChange={(event) => setCampo('ano', event.target.value)} type="number" placeholder="2022" /></div>
            <div><label>{cfg.identificador}</label><input value={form.identificador} onChange={(event) => setCampo('identificador', event.target.value)} placeholder={cfg.identificadorPlaceholder} /></div>
          </div>
          <div className="formGrid">
            <div><label>Custo</label><input value={form.valorCusto} onChange={(event) => setCampo('valorCusto', event.target.value)} type="number" step="0.01" placeholder="0,00" /></div>
            <div><label>Valor base de venda *</label><input value={form.valorVenda} onChange={(event) => setCampo('valorVenda', event.target.value)} type="number" step="0.01" placeholder="0,00" required /></div>
          </div>
          {erro && <span className="formError">{erro}</span>}
          <div className="modalActions"><button className="ghostButton" type="button" onClick={() => setAberto(false)}>Cancelar</button><button className="primaryButton" type="submit"><Check size={16} /> Salvar</button></div>
        </form>
      </Modal>
    </>
  );
}

function VendaForm({ produto, onVender, configuracoes = CONFIG_PADRAO }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ compradorNome: '', compradorTelefone: '', valorVenda: produto.valorVenda, valorEntrada: '', parcelas: configuracoes.parcelasVendaPadrao || CONFIG_PADRAO.parcelasVendaPadrao, observacao: '' });
  const [erro, setErro] = useState('');
  const jurosVenda = Number(configuracoes.jurosVendaPadrao || JUROS_NORMAL_VENDA);
  const valorBase = Number(form.valorVenda || 0);
  const valorComJuros = Number((valorBase * (1 + jurosVenda / 100)).toFixed(2));
  const valorEntrada = Number(form.valorEntrada || 0);
  const quantidadeParcelas = Math.max(1, Number(form.parcelas || 1));
  const saldoParcelado = Math.max(0, valorComJuros - valorEntrada);
  const valorParcela = Number((saldoParcelado / quantidadeParcelas).toFixed(2));

  async function vender(event) {
    event.preventDefault();
    setErro('');
    try {
      await onVender({ ...form, produtoId: produto.id });
      setAberto(false);
    } catch (error) {
      setErro(error.message);
    }
  }

  if (produto.status === 'VENDIDO') return <StatusBadge status="VENDIDO" />;
  if (!aberto) return <button className="smallButton" onClick={() => setAberto(true)}>Vender</button>;

  return (
    <form className="sellForm" onSubmit={vender}>
      <input value={form.compradorNome} onChange={(event) => setForm({ ...form, compradorNome: event.target.value })} placeholder="Comprador" required />
      <input value={form.compradorTelefone} onChange={(event) => setForm({ ...form, compradorTelefone: event.target.value })} placeholder="Telefone" />
      <input value={form.valorVenda} onChange={(event) => setForm({ ...form, valorVenda: event.target.value })} type="number" step="0.01" required />
      <input value={form.valorEntrada} onChange={(event) => setForm({ ...form, valorEntrada: event.target.value })} type="number" step="0.01" placeholder="Entrada" />
      <input value={form.parcelas} onChange={(event) => setForm({ ...form, parcelas: event.target.value })} type="number" min="1" max="120" />
      <input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} placeholder="Observacao da venda" />
      <div className="previewBox">
        <div><span>Juros normal</span><b>{jurosVenda}%</b></div>
        <div><span>Total com juros</span><b>{moeda(valorComJuros)}</b></div>
        <div><span>Parcela</span><b>{quantidadeParcelas}x de {moeda(valorParcela)}</b></div>
      </div>
      {erro && <span className="formError">{erro}</span>}
      <div className="formActions"><button className="ghostButton" type="button" onClick={() => setAberto(false)}>Cancelar</button><button className="primaryButton" type="submit">Concluir</button></div>
    </form>
  );
}

function ModuloVendas({ tipo, produtos, vendas, salvarProduto, venderProduto, excluirProduto, configuracoes }) {
  const config = TIPOS.find((item) => item.id === tipo);
  const [busca, setBusca] = useState('');
  const filtrados = produtos.filter((produto) => produto.tipo === tipo && `${produto.titulo} ${produto.marca} ${produto.modelo} ${produto.identificador}`.toLowerCase().includes(busca.toLowerCase()));
  const vendasTipo = vendas.filter((venda) => venda.produto?.tipo === tipo);
  const Icon = config.icon;
  const jurosVenda = Number(configuracoes.jurosVendaPadrao || JUROS_NORMAL_VENDA);

  return (
    <>
      <PageHeader
        title={config.label}
        subtitle={`Estoque e vendas de ${config.singular}s`}
        action={<ProdutoForm tipo={tipo} onSalvar={salvarProduto} />}
      />
      <div className="statsGrid compact">
        <Stat icon={Icon} label="Disponiveis" value={filtrados.filter((item) => item.status === 'DISPONIVEL').length} />
        <Stat icon={Check} label="Vendidos" value={vendasTipo.filter((item) => item.status === 'CONCLUIDA').length} tone="green" />
        <Stat icon={CircleDollarSign} label="Faturamento" value={moeda(vendasTipo.reduce((acc, venda) => acc + venda.valorVenda, 0))} tone="amber" />
      </div>
      <SearchBox value={busca} onChange={setBusca} />
      <div className="cardsGrid">
        {filtrados.map((produto) => (
          <article className="productCard" key={produto.id}>
            <div className="productTop">
              <Icon size={21} />
              <StatusBadge status={produto.status} />
            </div>
            <h3>{produto.titulo}</h3>
            <p>{[produto.marca, produto.modelo, produto.ano].filter(Boolean).join(' ') || 'Sem detalhes'}</p>
            <dl>
              <div><dt>Identificador</dt><dd>{produto.identificador || '-'}</dd></div>
              <div><dt>Custo</dt><dd>{moeda(produto.valorCusto)}</dd></div>
              <div><dt>Base venda</dt><dd>{moeda(produto.valorVenda)}</dd></div>
              <div><dt>Juros venda</dt><dd>Normal {jurosVenda}%</dd></div>
            </dl>
            <div className="rowActions">
              <VendaForm produto={produto} onVender={venderProduto} configuracoes={configuracoes} />
              <button className="dangerButton" onClick={() => excluirProduto(produto)} title="Excluir produto"><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [autenticado, setAutenticado] = useState(Boolean(localStorage.getItem('gp_token')));
  const [active, setActive] = useState(localStorage.getItem('gp_active_tab') || 'painel');
  const [dados, setDados] = useState({ clientes: [], emprestimos: [], produtos: [], vendas: [], alertas: null, financeiro: null });
  const [resumoVendas, setResumoVendas] = useState(null);
  const [paginacaoCredito, setPaginacaoCredito] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [paginacaoClientes, setPaginacaoClientes] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [filtrosClientes, setFiltrosClientes] = useState({ page: 1, limit: 50, busca: '' });
  const [filtrosCredito, setFiltrosCredito] = useState(() => {
    try {
      return { page: 1, limit: 25, busca: '', statusOperacao: '', inicio: '', fim: '', ...JSON.parse(localStorage.getItem('gp_credit_filters') || '{}') };
    } catch (error) {
      return { page: 1, limit: 25, busca: '', statusOperacao: '', inicio: '', fim: '' };
    }
  });
  const [buscaGlobal, setBuscaGlobal] = useState('');
  const [clienteInicialCredito, setClienteInicialCredito] = useState('');
  const [creditoPrefill, setCreditoPrefill] = useState(null);
  const [orcamentosRefreshKey, setOrcamentosRefreshKey] = useState(0);
  const [erro, setErro] = useState('');
  const [pagamento, setPagamento] = useState(null);
  const [parcelas, setParcelas] = useState(null);
  const [exclusao, setExclusao] = useState(null);
  const [produtoExclusao, setProdutoExclusao] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [observacaoModal, setObservacaoModal] = useState(null);
  const [renegociacaoModal, setRenegociacaoModal] = useState(null);
  const [clienteDetalhe, setClienteDetalhe] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [configuracoes, setConfiguracoes] = useState(CONFIG_PADRAO);

  function notificar(tipo, mensagem) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((atuais) => [...atuais, { id, tipo, mensagem }]);
    window.setTimeout(() => setToasts((atuais) => atuais.filter((toast) => toast.id !== id)), 3200);
  }

  function aplicarConfiguracoesOperacionais(lista = []) {
    const mapa = Object.fromEntries(lista.map(item => [item.chave, item.valor]));
    setConfiguracoes((atuais) => ({
      ...atuais,
      jurosCreditoPadrao: mapa.JUROS_PADRAO ?? atuais.jurosCreditoPadrao,
      diasParaVencerPadrao: mapa.DIAS_PRIMEIRO_VENCIMENTO ?? atuais.diasParaVencerPadrao,
      parcelasCreditoPadrao: mapa.PARCELAS_MINIMAS ?? atuais.parcelasCreditoPadrao,
      parcelasVendaPadrao: atuais.parcelasVendaPadrao,
      jurosVendaPadrao: mapa.JUROS_VENDA_PADRAO ?? atuais.jurosVendaPadrao,
    }));
  }

  function encerrarSessao() {
    localStorage.removeItem('gp_token');
    setAutenticado(false);
    setDados({ clientes: [], emprestimos: [], produtos: [], vendas: [], alertas: null, financeiro: null });
    setResumoVendas(null);
  }

  async function carregar() {
    if (!localStorage.getItem('gp_token')) return;
    setErro('');
    try {
      const paramsCredito = new URLSearchParams();
      Object.entries(filtrosCredito).forEach(([chave, valor]) => {
        if (valor !== '' && valor !== null && valor !== undefined) paramsCredito.set(chave, valor);
      });
      const paramsClientes = new URLSearchParams();
      Object.entries(filtrosClientes).forEach(([chave, valor]) => {
        if (valor !== '' && valor !== null && valor !== undefined) paramsClientes.set(chave, valor);
      });
      const [clientes, emprestimos, produtos, vendas, resumo, alertas, financeiro] = await Promise.all([
        api(`/clientes?${paramsClientes.toString()}`),
        api(`/emprestimos?${paramsCredito.toString()}`),
        api('/produtos-venda'),
        api('/vendas-produto'),
        api('/vendas/resumo'),
        api('/emprestimos/alertas'),
        api('/painel/financeiro'),
      ]);
      setDados({
        clientes: clientes.clientes || [],
        emprestimos: emprestimos.emprestimos || [],
        produtos: produtos.produtos || [],
        vendas: vendas.vendas || [],
        alertas: alertas.alertas || null,
        financeiro: financeiro.financeiro || null,
      });
      setPaginacaoCredito({
        page: emprestimos.page || 1,
        limit: emprestimos.limit || 25,
        total: emprestimos.total || 0,
        totalPages: emprestimos.totalPages || 1,
      });
      setPaginacaoClientes({
        page: clientes.page || 1,
        limit: clientes.limit || 50,
        total: clientes.total || 0,
        totalPages: clientes.totalPages || 1,
      });
      setResumoVendas(resumo.resumo);
    } catch (error) {
      if (error.status === 401) {
        encerrarSessao();
        return;
      }
      setErro(error.message);
    }
  }

  useEffect(() => { carregar(); }, [autenticado, filtrosCredito, filtrosClientes]);

  useEffect(() => {
    if (!autenticado) return;
    api('/configuracoes')
      .then((resposta) => aplicarConfiguracoesOperacionais(resposta.configuracoes || []))
      .catch(() => {});
  }, [autenticado]);

  useEffect(() => {
    localStorage.setItem('gp_active_tab', active);
  }, [active]);

  useEffect(() => {
    localStorage.setItem('gp_credit_filters', JSON.stringify(filtrosCredito));
  }, [filtrosCredito]);

  useEffect(() => {
    function atalhos(event) {
      if ((event.ctrlKey && event.key.toLowerCase() === 'k') || (!event.ctrlKey && event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName))) {
        event.preventDefault();
        document.querySelector('.globalSearch input')?.focus();
      }
    }
    window.addEventListener('keydown', atalhos);
    return () => window.removeEventListener('keydown', atalhos);
  }, []);

  const badges = useMemo(() => ({
    clientes: dados.clientes.length,
    emprestimos: dados.emprestimos.filter(operacaoPendente).length,
    tarefas: dados.emprestimos.filter((item) => item.statusOperacao === 'AGUARDANDO_ACEITE' || item.statusOperacao === 'APROVADO' || item.statusOperacao === 'ATRASADO').length + (dados.alertas?.vencendoHoje || 0),
    CARRO: dados.produtos.filter((item) => item.tipo === 'CARRO' && item.status === 'DISPONIVEL').length,
    MOTO: dados.produtos.filter((item) => item.tipo === 'MOTO' && item.status === 'DISPONIVEL').length,
    CELULAR: dados.produtos.filter((item) => item.tipo === 'CELULAR' && item.status === 'DISPONIVEL').length,
  }), [dados]);

  async function salvarProduto(produto) {
    await api('/produtos-venda', { method: 'POST', body: JSON.stringify(produto) });
    await carregar();
    notificar('sucesso', 'Item cadastrado no estoque.');
  }

  async function venderProduto(venda) {
    await api('/vendas-produto', { method: 'POST', body: JSON.stringify(venda) });
    await carregar();
    notificar('sucesso', 'Venda registrada com juros normal de 30%.');
  }

  async function confirmarExclusaoProduto(produto, senha) {
    await api(`/produtos-venda/${produto.id}`, { method: 'DELETE', body: JSON.stringify({ senha }) });
    await carregar();
    notificar('sucesso', 'Item removido do estoque.');
  }

  async function confirmarCancelamentoVenda(dadosConfirmacao) {
    const venda = dadosConfirmacao.venda;
    await api(`/vendas-produto/${venda.id}/cancelar`, { method: 'POST', body: JSON.stringify({}) });
    await carregar();
    notificar('sucesso', 'Venda cancelada e item voltou para disponivel.');
  }

  async function salvarCliente(cliente, arquivos = {}) {
    const resposta = await api('/clientes', { method: 'POST', body: JSON.stringify(cliente) });
    const clienteId = resposta.cliente?.id;
    const uploads = [
      ['RG_FRENTE', arquivos.rgFrente],
      ['RG_VERSO', arquivos.rgVerso],
      ['COMPROVANTE_ENDERECO', arquivos.comprovante],
    ].filter(([, arquivo]) => Boolean(arquivo));
    for (const [tipoDocumento, arquivo] of uploads) {
      const formData = new FormData();
      formData.append('tipoDocumento', tipoDocumento);
      formData.append('arquivo', arquivo);
      await apiUpload(`/clientes/${clienteId}/documentos`, formData);
    }
    await carregar();
    notificar('sucesso', 'Cliente cadastrado.');
  }

  async function salvarCredito(credito) {
    await api('/emprestimos', { method: 'POST', body: JSON.stringify({
      ...credito,
      valor: Number(credito.valor),
      juros: Number(credito.juros),
      diasParaVencer: Number(credito.diasParaVencer || 30),
      totalParcelas: Number(credito.totalParcelas || 1),
    }) });
    await carregar();
    setCreditoPrefill(null);
    notificar('sucesso', 'Operacao de credito criada.');
  }

  async function aceitarManual(emprestimo) {
    await api(`/emprestimos/${emprestimo.id}/aceitar`, { method: 'POST', body: JSON.stringify({}) });
    await carregar();
    notificar('sucesso', 'Aceite manual registrado.');
  }

  async function liberarDinheiro(emprestimo) {
    await api(`/emprestimos/${emprestimo.id}/liberar`, { method: 'POST', body: JSON.stringify({}) });
    await carregar();
    notificar('sucesso', 'Liberacao de dinheiro registrada.');
  }

  async function reenviarContrato(emprestimo) {
    await api(`/emprestimos/${emprestimo.id}/reenviar-contrato`, { method: 'POST', body: JSON.stringify({}) });
    notificar('sucesso', 'Contrato reenviado.');
  }

  async function reenviarPix(emprestimo) {
    await api(`/emprestimos/${emprestimo.id}/reenviar-pix`, { method: 'POST', body: JSON.stringify({}) });
    notificar('sucesso', 'Pix reenviado.');
  }

  async function salvarObservacao(emprestimo, observacao) {
    await api(`/emprestimos/${emprestimo.id}/observacao`, { method: 'PATCH', body: JSON.stringify({ observacao }) });
    await carregar();
    notificar('sucesso', 'Observacao atualizada.');
  }

  async function salvarRenegociacao(emprestimo, { dataVencimento, observacao }) {
    await api(`/emprestimos/${emprestimo.id}/renegociar`, { method: 'PATCH', body: JSON.stringify({ dataVencimento, observacao }) });
    await carregar();
    notificar('sucesso', 'Prazo renegociado.');
  }

  async function confirmarCobrancaLote(dadosConfirmacao) {
    const ids = dadosConfirmacao.ids || [];
    const resposta = await api('/emprestimos/cobranca-lote', { method: 'POST', body: JSON.stringify({ ids }) });
    await carregar();
    notificar(resposta.falhas ? 'erro' : 'sucesso', `Cobranca enviada: ${resposta.enviados} sucesso, ${resposta.falhas} falha(s).`);
  }

  function cobrarLote(ids) {
    setConfirmacao({
      tipo: 'cobranca-lote',
      ids,
      titulo: 'Enviar cobranca em lote',
      subtitulo: `${ids.length} operacao(oes) selecionada(s).`,
      resumo: 'O sistema tentara disparar a cobranca pelo WhatsApp para todos os itens selecionados.',
    });
  }

  async function confirmarPagamento(emprestimoId, valorPago) {
    await api(`/emprestimos/${emprestimoId}/pagar`, { method: 'POST', body: JSON.stringify({ valorPago }) });
    await carregar();
    notificar('sucesso', 'Pagamento confirmado.');
  }

  async function pagarParcela(emprestimoId, parcelaId) {
    await api(`/emprestimos/${emprestimoId}/parcelas/${parcelaId}/pagar`, { method: 'POST', body: JSON.stringify({}) });
    await carregar();
    setParcelas(null);
    notificar('sucesso', 'Parcela marcada como paga.');
  }

  async function pagarProximaParcela(emprestimo) {
    const proxima = (emprestimo.parcelas || [])
      .filter((parcela) => parcela.status !== 'pago')
      .sort((a, b) => a.numero - b.numero)[0];
    if (proxima) {
      await pagarParcela(emprestimo.id, proxima.id);
      return;
    }
    setPagamento(emprestimo);
  }

  async function confirmarExclusao(alvo, senha) {
    const path = alvo.tipo === 'cliente'
      ? `/clientes/${alvo.id}`
      : alvo.tipo === 'orcamento'
        ? `/orcamentos/${alvo.id}`
        : `/emprestimos/${alvo.id}`;
    await api(path, { method: 'DELETE', body: JSON.stringify({ senha }) });
    await carregar();
    if (alvo.tipo === 'orcamento') {
      setOrcamentosRefreshKey((valor) => valor + 1);
      notificar('sucesso', 'Orcamento excluido.');
      return;
    }
    notificar('sucesso', 'Registro excluido.');
  }

  function sair() {
    encerrarSessao();
  }

  function novaOperacaoCliente(cliente) {
    setClienteInicialCredito(cliente.id);
    setCreditoPrefill(null);
    setClienteDetalhe(null);
    setActive('credito');
  }

  function converterOrcamento(orcamento) {
    const primeiro = orcamento.primeiroVencimento || orcamento.primeiroVencimento?.slice?.(0, 10);
    const dias = primeiro ? Math.max(1, Math.ceil((new Date(primeiro) - new Date()) / (1000 * 60 * 60 * 24))) : configuracoes.diasParaVencerPadrao;
    setCreditoPrefill({
      clienteId: orcamento.clienteId || orcamento.cliente?.id || '',
      valor: orcamento.valor || '',
      juros: orcamento.juros || configuracoes.jurosCreditoPadrao,
      totalParcelas: orcamento.parcelas || orcamento.totalParcelas || configuracoes.parcelasCreditoPadrao,
      diasParaVencer: dias,
    });
    setClienteInicialCredito('');
    setActive('credito');
    notificar('sucesso', 'Orcamento carregado na nova operacao.');
  }

  const resultadosGlobais = useMemo(() => {
    const termo = buscaGlobal.trim().toLowerCase();
    if (!termo) return [];
    const clientes = dados.clientes
      .filter((cliente) => `${cliente.nome} ${cliente.telefone} ${cliente.cpf || ''}`.toLowerCase().includes(termo))
      .slice(0, 5)
      .map((cliente) => ({ tipo: 'cliente', id: cliente.id, titulo: cliente.nome, subtitulo: `Cliente - ${cliente.telefone}` }));
    const operacoes = dados.emprestimos
      .filter((item) => `${item.numeroOperacao} ${item.numeroContrato || ''} ${item.cliente?.nome || ''}`.toLowerCase().includes(termo))
      .slice(0, 5)
      .map((item) => ({ tipo: 'operacao', id: item.numeroOperacao, titulo: item.numeroOperacao, subtitulo: `${item.cliente?.nome || '-'} - ${moeda(item.valorTotal)}` }));
    return [...clientes, ...operacoes].slice(0, 8);
  }, [buscaGlobal, dados]);

  function abrirResultadoOperacao(numeroOperacao) {
    setFiltrosCredito({ ...filtrosCredito, busca: numeroOperacao, page: 1 });
    setActive('credito');
    setBuscaGlobal('');
  }

  if (!autenticado) return <Login onLogin={() => setAutenticado(true)} />;

  return (
    <Shell
      active={active}
      setActive={setActive}
      onLogout={sair}
      badges={badges}
      globalSearch={<GlobalSearch query={buscaGlobal} setQuery={setBuscaGlobal} resultados={resultadosGlobais} onOpenCliente={(id) => { setClienteDetalhe(id); setBuscaGlobal(''); }} onOpenOperacao={abrirResultadoOperacao} />}
    >
      {erro && <div className="errorBanner">{erro}</div>}
      {active === 'painel' && <Painel dados={dados} resumoVendas={resumoVendas} recarregar={carregar} />}
      {active === 'tarefas' && <TarefasHoje emprestimos={dados.emprestimos} abrirPagar={setPagamento} aceitarManual={aceitarManual} liberarDinheiro={liberarDinheiro} reenviarPix={reenviarPix} />}
      {active === 'orcamentos' && <Orcamentos clientes={dados.clientes} configuracoes={configuracoes} notificar={notificar} converterOrcamento={converterOrcamento} refreshKey={orcamentosRefreshKey} excluirOrcamento={(orcamento) => setExclusao({ tipo: 'orcamento', id: orcamento.id, nome: `orcamento de ${orcamento.cliente?.nome || 'simulacao'}`, resumo: `Valor ${moeda(orcamento.valor)}, ${orcamento.parcelas} parcela(s), status ${orcamento.status}. O PDF salvo tambem sera removido.` })} />}
      {active === 'clientes' && <Clientes clientes={dados.clientes} salvarCliente={salvarCliente} verCliente={setClienteDetalhe} onUnauthorized={encerrarSessao} filtros={filtrosClientes} setFiltros={setFiltrosClientes} paginacao={paginacaoClientes} excluirCliente={(cliente) => setExclusao({ tipo: 'cliente', id: cliente.id, nome: cliente.nome, resumo: `Este cliente tem ${cliente.emprestimos?.length || 0} operacao(oes) aberta(s) vinculada(s). Documentos, contratos, parcelas, pagamentos e vendas vinculadas tambem serao removidos.` })} />}
      {active === 'credito' && <Credito emprestimos={dados.emprestimos} clientes={dados.clientes} salvarCredito={salvarCredito} abrirPagar={setPagamento} abrirParcelas={setParcelas} filtros={filtrosCredito} setFiltros={setFiltrosCredito} paginacao={paginacaoCredito} aceitarManual={aceitarManual} liberarDinheiro={liberarDinheiro} reenviarContrato={reenviarContrato} reenviarPix={reenviarPix} atualizarObservacao={setObservacaoModal} pagarProximaParcela={pagarProximaParcela} renegociarPrazo={setRenegociacaoModal} cobrarLote={cobrarLote} clienteInicial={creditoPrefill || clienteInicialCredito} configuracoes={configuracoes} excluirEmprestimo={(emprestimo) => setExclusao({ tipo: 'emprestimo', id: emprestimo.id, nome: `emprestimo de ${emprestimo.cliente?.nome || 'cliente'}`, resumo: `${emprestimo.totalParcelas || 1} parcela(s), ${moeda(emprestimo.valorTotal)} total, status ${emprestimo.statusOperacao || emprestimo.status}.` })} />}
      {active === 'relatorios' && <Relatorios />}
      {active === 'relatorio-vendas' && <RelatorioVendas vendas={dados.vendas} resumoVendas={resumoVendas} cancelarVenda={(venda) => setConfirmacao({ tipo: 'cancelar-venda', venda, perigo: true, titulo: 'Cancelar venda', subtitulo: venda.produto?.titulo || venda.compradorNome, resumo: 'A venda sera cancelada e o item voltara para o estoque como disponivel.' })} />}
      {active === 'configuracoes' && <Configuracoes notificar={notificar} onAtualizarPadroes={aplicarConfiguracoesOperacionais} />}
      {TIPOS.some((tipo) => tipo.id === active) && (
        <ModuloVendas tipo={active} produtos={dados.produtos} vendas={dados.vendas} salvarProduto={salvarProduto} venderProduto={venderProduto} excluirProduto={setProdutoExclusao} configuracoes={configuracoes} />
      )}
      <PagamentoModal emprestimo={pagamento} onClose={() => setPagamento(null)} onConfirmar={confirmarPagamento} />
      <ParcelasModal emprestimo={parcelas} onClose={() => setParcelas(null)} onPagarParcela={pagarParcela} />
      <ExclusaoModal alvo={exclusao} onClose={() => setExclusao(null)} onConfirmar={confirmarExclusao} />
      <ProdutoExclusaoModal produto={produtoExclusao} onClose={() => setProdutoExclusao(null)} onConfirmar={confirmarExclusaoProduto} />
      <ConfirmacaoModal dados={confirmacao} onClose={() => setConfirmacao(null)} onConfirmar={(dadosConfirmacao) => dadosConfirmacao.tipo === 'cancelar-venda' ? confirmarCancelamentoVenda(dadosConfirmacao) : confirmarCobrancaLote(dadosConfirmacao)} />
      <ObservacaoModal emprestimo={observacaoModal} onClose={() => setObservacaoModal(null)} onSalvar={salvarObservacao} />
      <RenegociacaoModal emprestimo={renegociacaoModal} onClose={() => setRenegociacaoModal(null)} onSalvar={salvarRenegociacao} />
      <ClienteDetalheModal clienteId={clienteDetalhe} onClose={() => setClienteDetalhe(null)} onDocumentoAlterado={carregar} onNovaOperacao={novaOperacaoCliente} />
      <ToastStack toasts={toasts} />
    </Shell>
  );
}


