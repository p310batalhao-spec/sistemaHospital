// =============================================================================
// "Banco" simulado no localStorage. As tabelas e campos espelham o schema Prisma
// (packages/database/prisma/schema) para que a troca pela API NestJS real seja
// apenas a substituição de backend/api.js por chamadas HTTP.
// Todos os portais abertos no mesmo endereço do Live Server compartilham estes dados.
// =============================================================================

import { uuid } from '../lib/util.js';

const CHAVE = 'elosaude.db.v1';

export const TABELAS = [
  'tenants', 'tenantBranding', 'estabelecimentos', 'usuarios', 'membros', 'papeis',
  'pessoas', 'consentimentos', 'planos', 'planoBeneficios', 'itensCatalogo', 'tabelaPrecos',
  'assinaturas', 'beneficiarios', 'validacoes', 'especialidades', 'profissionais',
  'gradesAgenda', 'agendamentos', 'faturas', 'cobrancas', 'reguaEtapas', 'notificacoes',
  'transacoes', 'regrasRepasse', 'lotesRepasse', 'avaliacoes', 'logAuditoria',
];

let estado = carregar();
const ouvintes = new Set();

function vazio() {
  return Object.fromEntries(TABELAS.map((t) => [t, []]));
}

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    for (const t of TABELAS) dados[t] ??= [];
    return dados;
  } catch {
    return null;
  }
}

function persistir() {
  localStorage.setItem(CHAVE, JSON.stringify(estado));
  ouvintes.forEach((fn) => fn());
}

// Outra aba (ex.: portal do parceiro) alterou os dados → recarrega e avisa a UI.
window.addEventListener('storage', (e) => {
  if (e.key !== CHAVE) return;
  estado = carregar();
  ouvintes.forEach((fn) => fn());
});

export const db = {
  existe: () => estado !== null,

  /** Substitui todo o banco (usado pelo seed). */
  restaurar(dados) {
    estado = { ...vazio(), ...dados };
    persistir();
  },

  apagar() {
    localStorage.removeItem(CHAVE);
    estado = null;
  },

  todos: (tabela) => estado[tabela],

  onde: (tabela, pred) => estado[tabela].filter(pred),

  um: (tabela, pred) => estado[tabela].find(pred) ?? null,

  porId: (tabela, id) => estado[tabela].find((r) => r.id === id) ?? null,

  inserir(tabela, registro) {
    const linha = { id: uuid(), criadoEm: new Date().toISOString(), ...registro };
    estado[tabela].push(linha);
    persistir();
    return linha;
  },

  atualizar(tabela, id, alteracoes) {
    const linha = estado[tabela].find((r) => r.id === id);
    if (!linha) throw new Error(`${tabela}/${id} não encontrado`);
    Object.assign(linha, alteracoes, { atualizadoEm: new Date().toISOString() });
    persistir();
    return linha;
  },

  aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  },
};
