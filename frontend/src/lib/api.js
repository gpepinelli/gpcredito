import { API_BASE } from './constants.js';

export async function api(path, options = {}) {
  const token = localStorage.getItem('gp_token');
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const resposta = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || dados.sucesso === false) {
    const erro = new Error(dados.mensagem || dados.erros?.[0]?.msg || 'Falha na requisicao');
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

export async function apiUpload(path, formData) {
  return api(path, { method: 'POST', body: formData, headers: {} });
}
