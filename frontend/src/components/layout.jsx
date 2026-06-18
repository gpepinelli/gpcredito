import React, { useState } from 'react';
import {
  BadgeDollarSign,
  Calculator,
  Check,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { TIPOS } from '../lib/constants.js';
import { api } from '../lib/api.js';

export function Login({ onLogin }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(event) {
    event.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const resposta = await api('/auth/login', { method: 'POST', body: JSON.stringify({ senha }) });
      localStorage.setItem('gp_token', resposta.token);
      onLogin();
    } catch (error) {
      setErro(error.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={entrar}>
        <div className="brandMark"><ShieldCheck size={24} /></div>
        <h1>GPCredito V2</h1>
        <p>Gestao de credito, vendas e carteira em uma operacao unica.</p>
        <label htmlFor="senha">Senha administrativa</label>
        <input id="senha" type="password" value={senha} onChange={(event) => setSenha(event.target.value)} autoFocus />
        {erro && <span className="formError">{erro}</span>}
        <button className="primaryButton" type="submit" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  );
}

export function Shell({ children, active, setActive, onLogout, badges, globalSearch }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const grupos = [
    {
      titulo: 'Cadastro',
      itens: [
        { id: 'painel', label: 'Painel', icon: CircleDollarSign },
        { id: 'clientes', label: 'Clientes', icon: Users, badge: badges.clientes },
        { id: 'carteira', label: 'Carteira', icon: Wallet },
      ],
    },
    {
      titulo: 'Credito',
      itens: [
        { id: 'tarefas', label: 'Agenda do Dia', icon: ClipboardList, badge: badges.tarefas },
        { id: 'orcamentos', label: 'Orcamento', icon: Calculator },
        { id: 'credito', label: 'Operacoes', icon: BadgeDollarSign, badge: badges.emprestimos },
        { id: 'relatorios', label: 'Relatorio financeiro', icon: FileText },
      ],
    },
    {
      titulo: 'Vendas',
      itens: [
        ...TIPOS.map((tipo) => ({ id: tipo.id, label: tipo.label, icon: tipo.icon, badge: badges[tipo.id] })),
        { id: 'relatorio-vendas', label: 'Relatorio de vendas', icon: ClipboardList },
      ],
    },
    {
      titulo: 'Sistema',
      itens: [
        { id: 'configuracoes', label: 'Configuracoes', icon: Settings },
      ],
    },
  ];

  function navegar(id) {
    setActive(id);
    setMenuAberto(false);
  }

  return (
    <div className={menuAberto ? 'appShell menuOpen' : 'appShell'}>
      <header className="mobileTopbar">
        <button className="iconButton" onClick={() => setMenuAberto(true)} title="Abrir menu"><Menu size={20} /></button>
        <div><strong>GPCredito</strong><span>Painel administrativo</span></div>
      </header>
      <button className="sidebarBackdrop" type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />
      <aside className="sidebar">
        <div className="logo">
          <div className="logoIcon"><ShieldCheck size={20} /></div>
          <div><strong>GPCredito</strong><span>Painel administrativo</span></div>
          <button className="mobileClose" onClick={() => setMenuAberto(false)} title="Fechar menu"><X size={18} /></button>
        </div>
        <nav>
          {grupos.map((grupo) => (
            <div className="navGroup" key={grupo.titulo}>
              <div className="navSection">{grupo.titulo}</div>
              {grupo.itens.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className={active === item.id ? 'navItem active' : 'navItem'} onClick={() => navegar(item.id)}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.badge > 0 && <em>{item.badge}</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button className="logoutButton" onClick={onLogout}><LogOut size={17} /> Sair</button>
      </aside>
      <section className="workspace">
        {globalSearch}
        {children}
      </section>
    </div>
  );
}

export function GlobalSearch({ query, setQuery, resultados, onOpenCliente, onOpenOperacao }) {
  return (
    <div className="globalSearch">
      <Search size={17} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente ou operacao (Ctrl+K)" />
      {query && (
        <div className="globalResults">
          {resultados.length === 0 && <button type="button">Nenhum resultado</button>}
          {resultados.map((item) => (
            <button key={item.tipo + item.id} type="button" onClick={() => item.tipo === 'cliente' ? onOpenCliente(item.id) : onOpenOperacao(item.id)}>
              <strong>{item.titulo}</strong>
              <span>{item.subtitulo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <header className="pageHeader">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function Stat({ icon: Icon, label, value, tone = 'blue' }) {
  return (
    <article className={`stat ${tone}`}>
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function Modal({ aberto, titulo, subtitulo, icon: Icon = FileText, children, onClose, size = '' }) {
  if (!aberto) return null;
  return (
    <div className="modalOverlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${size}`}>
        <button className="modalClose" onClick={onClose} title="Fechar"><X size={18} /></button>
        <div className="modalIcon"><Icon size={22} /></div>
        <h3>{titulo}</h3>
        {subtitulo && <p>{subtitulo}</p>}
        {children}
      </section>
    </div>
  );
}

export function ToastStack({ toasts }) {
  return (
    <div className="toastStack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.tipo || 'info'}`} key={toast.id}>
          {toast.tipo === 'erro' ? <X size={17} /> : <Check size={17} />}
          <span>{toast.mensagem}</span>
        </div>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange }) {
  return (
    <div className="searchBox">
      <Search size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Buscar" />
    </div>
  );
}
