// =============================================================================
// PAINEL ADMINISTRATIVO DO HOSPITAL
// =============================================================================

import { aoMudarDados, criarApi, garantirBanco } from '../assets/js/backend/api.js';
import { descreverRegra } from '../assets/js/backend/regras.js';
import { debounce, esc, fmt } from '../assets/js/lib/util.js';
import { abrirCobranca } from '../assets/js/ui/cobranca.js';
import { renderizarLogin } from '../assets/js/ui/login.js';
import { blocoDependente, formularioAdesao, ligarFormularioAdesao } from '../assets/js/ui/adesao.js';
import {
  ICONE_CATEGORIA, ROTULO_CATEGORIA, ROTULO_PARENTESCO, ROTULO_TIPO_ESTAB, aplicarBranding, avatar, badge, btn, campo, carregando, cls,
  comCarregando, confirmar, dadosForm, estrelas, faixaSimulacao, icone, modal, opcoes, rotuloStatus, roteador, toast, tratarErro, vazio,
} from '../assets/js/ui/ui.js';

const api = criarApi('admin');
const raiz = document.getElementById('app');
let rotaAtual = null;
let pararRoteador = () => {};

function iniciar() {
  if (!api.sessao()) return telaLogin();
  aplicarBranding(api.branding());
  montarShell();
  pararRoteador = roteador(ROTAS, (r) => {
    rotaAtual = r;
    renderizarRota();
  });
}

function telaLogin() {
  renderizarLogin(raiz, {
    portal: 'admin',
    titulo: 'Painel do Hospital',
    subtitulo: 'Gestão do clube de benefícios',
    icone: 'painel',
    entrar: async (dados) => {
      await api.auth.login(dados);
      location.hash = '#/';
      iniciar();
    },
  });
}

// ---- Shell -----------------------------------------------------------------------

const MENU = [
  ['#/', 'Painel', 'painel', 'dashboard.ver'],
  ['#/beneficiarios', 'Beneficiários', 'usuarios', 'beneficiarios.ler'],
  ['#/planos', 'Planos e benefícios', 'plano', 'planos.ler'],
  ['#/rede', 'Rede credenciada', 'predio', 'rede.ler'],
  ['#/financeiro', 'Financeiro', 'dinheiro', 'financeiro.ler'],
  ['#/b2b', 'Extrato B2B e repasses', 'troca', 'b2b.ler'],
  ['#/acessos', 'Acessos', 'chave', 'acessos.gerenciar'],
  ['#/auditoria', 'Auditoria', 'escudo', 'auditoria.ler'],
];

function montarShell() {
  const s = api.sessao();
  const t = api.tenant();
  const b = api.branding();
  const itens = MENU.filter(([, , , p]) => api.pode(p));
  const link = ([href, rotulo, ic]) =>
    `<a href="${href}" data-menu="${href}" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">${icone(ic, 'size-4.5')}${rotulo}</a>`;
  raiz.innerHTML = `
    ${faixaSimulacao()}
    <div class="lg:flex">
      <aside id="menu" class="fixed inset-y-0 left-0 z-40 hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span class="flex size-9 items-center justify-center rounded-xl bg-marca text-white">${icone('coracao', 'size-5')}</span>
          <div class="min-w-0"><p class="truncate text-sm font-bold text-slate-900">${esc(t.nomeFantasia)}</p><p class="truncate text-xs text-slate-500">${esc(b.nomeApp)}</p></div>
        </div>
        <nav class="flex-1 space-y-0.5 overflow-y-auto p-3">${itens.map(link).join('')}</nav>
        <div class="border-t border-slate-100 p-3">
          <div class="flex items-center gap-3 rounded-lg px-2 py-2">${avatar(s.nome)}<div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">${esc(s.nome)}</p><p class="truncate text-xs text-slate-500">${esc(s.papeis.map((p) => ({ ADMIN_HOSPITAL: 'Administrador', FINANCEIRO: 'Financeiro', RECEPCAO: 'Recepção' })[p] ?? p).join(', '))}</p></div>
          <button id="sair" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer" title="Sair">${icone('sair', 'size-4')}</button></div>
        </div>
      </aside>
      <div id="fundo-menu" class="fixed inset-0 z-30 hidden bg-slate-900/40 lg:hidden"></div>
      <div class="min-w-0 flex-1">
        <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button id="abrir-menu" class="rounded-lg p-2 text-slate-600 hover:bg-slate-100 cursor-pointer" aria-label="Menu">${icone('menu')}</button>
          <span class="font-bold">${esc(t.nomeFantasia)}</span>
        </header>
        <main id="conteudo" class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"></main>
      </div>
    </div>`;
  const menu = raiz.querySelector('#menu');
  const fundo = raiz.querySelector('#fundo-menu');
  const alternar = (abrir) => {
    menu.classList.toggle('hidden', !abrir);
    menu.classList.toggle('flex', abrir);
    fundo.classList.toggle('hidden', !abrir);
  };
  raiz.querySelector('#abrir-menu').addEventListener('click', () => alternar(true));
  fundo.addEventListener('click', () => alternar(false));
  menu.addEventListener('click', (e) => e.target.closest('a') && window.innerWidth < 1024 && alternar(false));
  raiz.querySelector('#sair').addEventListener('click', async () => {
    await api.auth.logout();
    pararRoteador();
    rotaAtual = null;
    location.hash = '';
    telaLogin();
  });
}

const conteudo = () => raiz.querySelector('#conteudo');

// Renderizações em fila: uma por vez; pedidos intermediários colapsam no mais recente.
// Evita que uma tela assíncrona antiga sobrescreva a rota para a qual o usuário já navegou.
let filaRender = Promise.resolve();
let ultimoPedido = 0;
function renderizarRota() {
  const pedido = ++ultimoPedido;
  filaRender = filaRender.then(() => (pedido === ultimoPedido ? executarRender() : undefined)).catch(tratarErro);
  return filaRender;
}

async function executarRender() {
  if (!rotaAtual || !conteudo()) return;
  // Troca o contêiner por um clone vazio: descarta listeners da página anterior.
  const anterior = conteudo();
  anterior.replaceWith(anterior.cloneNode(false));
  const base = '#/' + (rotaAtual.rota.split('/').filter(Boolean)[0] ?? '');
  raiz.querySelectorAll('[data-menu]').forEach((a) => {
    const ativo = a.dataset.menu === base;
    a.classList.toggle('bg-marca-clara', ativo);
    a.classList.toggle('text-marca', ativo);
  });
  try {
    await rotaAtual.fn(rotaAtual.params);
  } catch (e) {
    tratarErro(e);
    if (e.status === 403) conteudo().innerHTML = vazio('Seu perfil não tem acesso a esta área.', 'escudo');
  }
}

// Outra aba (portal do parceiro / app) alterou dados → atualiza a tela, exceto com modal aberto.
aoMudarDados(debounce(() => api.sessao() && !document.querySelector('[role=dialog]') && renderizarRota(), 400));

const cabecalho = (titulo, subtitulo = '', acoes = '') => `
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><h1 class="text-2xl font-extrabold tracking-tight text-slate-900">${esc(titulo)}</h1>${subtitulo ? `<p class="mt-1 text-sm text-slate-500">${esc(subtitulo)}</p>` : ''}</div>
    <div class="flex flex-wrap gap-2">${acoes}</div>
  </div>`;

const tabela = (colunas, linhas, { vazioTexto = 'Nada encontrado.' } = {}) =>
  linhas.length
    ? `<div class="${cls.card} overflow-hidden"><div class="overflow-x-auto rolagem-fina"><table class="w-full min-w-[720px]">
        <thead class="border-b border-slate-200 bg-slate-50/70"><tr>${colunas.map((c) => `<th class="${cls.th} ${c.startsWith('>') ? 'text-right' : ''}">${esc(c.replace(/^>/, ''))}</th>`).join('')}</tr></thead>
        <tbody class="divide-y divide-slate-100">${linhas.join('')}</tbody></table></div></div>`
    : `<div class="${cls.card}">${vazio(vazioTexto)}</div>`;

const kpi = (rotulo, valor, detalhe = '', tom = '') => `
  <div class="${cls.card} p-4">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${esc(rotulo)}</p>
    <p class="mt-1 text-2xl font-extrabold tracking-tight ${tom || 'text-slate-900'}">${valor}</p>
    ${detalhe ? `<p class="mt-0.5 text-xs text-slate-500">${detalhe}</p>` : ''}
  </div>`;

// ---- Gráficos (série única na cor da marca, com tooltip e tabela) ---------------

let tooltipEl;
document.addEventListener('mousemove', (e) => {
  const alvo = e.target.closest?.('[data-dica]');
  if (!alvo) return tooltipEl?.remove(), (tooltipEl = null);
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip-grafico';
    document.body.append(tooltipEl);
  }
  tooltipEl.innerHTML = alvo.dataset.dica;
  const x = Math.min(e.clientX + 14, window.innerWidth - tooltipEl.offsetWidth - 8);
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${e.clientY - tooltipEl.offsetHeight - 10}px`;
});

function graficoColunas(dados, { formatar = fmt.moeda, altura = 'h-48' } = {}) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const passos = [1, 0.5, 0];
  return `
    <div class="relative ${altura} pl-14">
      ${passos.map((p) => `<div class="absolute left-14 right-0 border-t border-slate-100" style="bottom:${p * 100}%"><span class="absolute -left-14 -translate-y-1/2 text-[11px] text-slate-400">${esc(formatar(max * p))}</span></div>`).join('')}
      <div class="grafico-barras relative">
        ${dados.map((d) => `<div class="coluna" data-dica="${esc(d.dica)}" aria-label="${esc(d.rotulo)}: ${esc(formatar(d.valor))}"><div class="barra" style="height:${Math.max(1, (d.valor / max) * 100)}%"></div></div>`).join('')}
      </div>
    </div>
    <div class="flex gap-[2px] pl-14 pt-2">${dados.map((d) => `<span class="flex-1 text-center text-[11px] capitalize text-slate-500">${esc(d.rotulo)}</span>`).join('')}</div>`;
}

function barrasHorizontais(dados, { formatar = (v) => v } = {}) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return `<ul class="space-y-3">${dados
    .map(
      (d) => `<li data-dica="${esc(d.dica ?? `${d.rotulo}: ${formatar(d.valor)}`)}">
        <div class="mb-1 flex justify-between gap-2 text-sm"><span class="truncate text-slate-700">${esc(d.rotulo)}</span><span class="font-semibold text-slate-900">${esc(formatar(d.valor))}</span></div>
        <div class="h-2.5 rounded-r bg-slate-100"><div class="barra-h" style="width:${Math.max(2, (d.valor / max) * 100)}%"></div></div>
      </li>`,
    )
    .join('')}</ul>`;
}

const alternarTabela = (id) => `<button type="button" data-alternar="${id}" class="text-xs font-semibold text-marca hover:underline cursor-pointer">Ver como tabela</button>`;

function ligarAlternadores(el) {
  el.querySelectorAll('[data-alternar]').forEach((b) =>
    b.addEventListener('click', () => {
      const alvo = el.querySelector(`#${b.dataset.alternar}`);
      const mostrarTabela = alvo.querySelector('[data-visao=tabela]').classList.contains('hidden');
      alvo.querySelector('[data-visao=grafico]').classList.toggle('hidden', mostrarTabela);
      alvo.querySelector('[data-visao=tabela]').classList.toggle('hidden', !mostrarTabela);
      b.textContent = mostrarTabela ? 'Ver como gráfico' : 'Ver como tabela';
    }),
  );
}

// =============================================================================
// ROTAS
// =============================================================================

const ROTAS = {
  '/': paginaDashboard,
  '/beneficiarios': paginaBeneficiarios,
  '/beneficiarios/:id': paginaContrato,
  '/planos': paginaPlanos,
  '/rede': paginaRede,
  '/financeiro': paginaFinanceiro,
  '/b2b': paginaB2B,
  '/acessos': paginaAcessos,
  '/auditoria': paginaAuditoria,
};

// ---- Dashboard ---------------------------------------------------------------------

async function paginaDashboard() {
  if (!api.pode('dashboard.ver')) return (location.hash = '#/beneficiarios');
  conteudo().innerHTML = carregando();
  const d = await api.admin.dashboard();
  const k = d.kpis;
  const pend = d.pendencias;
  const mesAtual = d.receitaMensal[5];
  const anterior = d.receitaMensal[4];
  const variacao = anterior.recebido ? (mesAtual.recebido - anterior.recebido) / anterior.recebido : 0;

  conteudo().innerHTML = `
    ${cabecalho('Painel executivo', `${api.tenant().nomeFantasia} · dados atualizados agora`)}
    ${pend.credenciamentos + pend.acessos + pend.adesoes ? `
      <div class="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        ${icone('alerta', 'size-5')}<b>Pendências:</b>
        ${pend.credenciamentos ? `<a class="underline" href="#/rede">${pend.credenciamentos} credenciamento(s) em análise</a>` : ''}
        ${pend.acessos ? `<a class="underline" href="#/acessos">${pend.acessos} acesso(s) aguardando aprovação</a>` : ''}
        ${pend.adesoes ? `<a class="underline" href="#/beneficiarios?status=PENDENTE_ATIVACAO">${pend.adesoes} adesão(ões) para ativar</a>` : ''}
      </div>` : ''}
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      ${kpi('Contratos ativos', fmt.numero(k.contratosAtivos), `${fmt.numero(k.beneficiariosAtivos)} vidas cobertas`)}
      ${kpi('Receita recorrente (MRR)', fmt.moeda(k.mrr), `${fmt.numero(k.novasVendasMes)} novas adesões no mês`)}
      ${kpi('Adimplência (60 dias)', fmt.pct(k.adimplencia), `${fmt.moeda(k.emAberto)} vencidos em aberto`, k.adimplencia < 0.9 ? 'text-amber-700' : 'text-slate-900')}
      ${kpi('Inadimplentes / suspensos', `${fmt.numero(k.inadimplentes)} / ${fmt.numero(k.suspensos)}`, `Churn do mês: ${fmt.pct(k.churnMes)} (${k.canceladasMes} cancel.)`)}
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <section class="${cls.card} p-5 lg:col-span-2" id="g-receita">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div><h2 class="font-semibold text-slate-900">Mensalidades recebidas</h2><p class="text-xs text-slate-500">Últimos 6 meses, por data de pagamento</p></div>
          <div class="text-right"><p class="text-xl font-extrabold">${fmt.moeda(mesAtual.recebido)}</p><p class="text-xs ${variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}">${variacao >= 0 ? '▲' : '▼'} ${fmt.pct(Math.abs(variacao))} vs. mês anterior</p></div>
        </div>
        <div class="mt-5" data-visao="grafico">${graficoColunas(d.receitaMensal.map((m) => ({ rotulo: fmt.mes(m.mes), valor: m.recebido, dica: `<b>${fmt.mes(m.mes)}</b><br>Recebido: ${fmt.moeda(m.recebido)}<br>Previsto (competência): ${fmt.moeda(m.previsto)}` })))}</div>
        <div class="mt-5 hidden overflow-x-auto" data-visao="tabela"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500"><th class="py-1">Mês</th><th class="py-1 text-right">Recebido</th><th class="py-1 text-right">Previsto</th><th class="py-1 text-right">Economia gerada</th></tr></thead><tbody>${d.receitaMensal.map((m) => `<tr class="border-t border-slate-100"><td class="py-1.5 capitalize">${fmt.mes(m.mes)}</td><td class="py-1.5 text-right">${fmt.moeda(m.recebido)}</td><td class="py-1.5 text-right">${fmt.moeda(m.previsto)}</td><td class="py-1.5 text-right">${fmt.moeda(m.economia)}</td></tr>`).join('')}</tbody></table></div>
        <div class="mt-3 text-right">${alternarTabela('g-receita')}</div>
      </section>

      <section class="${cls.card} p-5">
        <h2 class="font-semibold text-slate-900">Economia gerada aos associados</h2>
        <p class="text-xs text-slate-500">Descontos concedidos no mês atual</p>
        <p class="mt-4 text-3xl font-extrabold text-marca">${fmt.moeda(k.economiaMes)}</p>
        <p class="mt-1 text-sm text-slate-600">${fmt.numero(k.usosMes)} usos de benefício registrados</p>
        <div class="mt-5 border-t border-slate-100 pt-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Contratos ativos por plano</h3>
          <div class="mt-3">${barrasHorizontais(d.porPlano.map((p) => ({ rotulo: p.plano, valor: p.ativos })), { formatar: (v) => fmt.numero(v) })}</div>
        </div>
      </section>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <section class="${cls.card} p-5">
        <h2 class="font-semibold text-slate-900">Serviços mais usados</h2><p class="text-xs text-slate-500">Últimos 90 dias</p>
        <div class="mt-4">${barrasHorizontais(d.topServicos.map((s) => ({ rotulo: s.rotulo, valor: s.usos, dica: `${s.rotulo}: ${s.usos} usos · economia ${fmt.moeda(s.economia)}` })), { formatar: (v) => `${v} usos` })}</div>
      </section>
      <section class="${cls.card} p-5">
        <h2 class="font-semibold text-slate-900">Ranking da rede</h2><p class="text-xs text-slate-500">Atendimentos de associados em 90 dias</p>
        <ol class="mt-4 space-y-3">${d.rankingParceiros.map((p, i) => `<li class="flex items-center gap-3 text-sm"><span class="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">${i + 1}</span><span class="min-w-0 flex-1 truncate">${esc(p.rotulo)}</span><span class="text-right"><b>${p.usos}</b> <span class="text-xs text-slate-500">usos</span><br><span class="text-xs text-slate-500">${fmt.moeda(p.economia)} em descontos</span></span></li>`).join('')}</ol>
      </section>
      <section class="${cls.card} p-5">
        <h2 class="font-semibold text-slate-900">Produtividade médica</h2><p class="text-xs text-slate-500">Atendimentos por profissional em 90 dias</p>
        <div class="mt-4">${barrasHorizontais(d.rankingProfissionais.map((p) => ({ rotulo: p.rotulo, valor: p.usos })), { formatar: (v) => `${v} atend.` })}</div>
      </section>
    </div>`;
  ligarAlternadores(conteudo());
}

// ---- Beneficiários --------------------------------------------------------------------

let filtrosBenef = { busca: '', status: '', planoId: '' };

async function paginaBeneficiarios(params) {
  // Link vindo das pendências do painel: aplica só o status pedido.
  if (params.status) filtrosBenef = { busca: '', status: params.status, planoId: '' };
  const planos = await api.admin.planos().catch(() => []);
  conteudo().innerHTML = `
    ${cabecalho('Beneficiários', 'Titulares, dependentes e contratos', api.pode('beneficiarios.gerenciar') ? `<button id="nova-adesao" class="${btn()}">${icone('mais', 'size-4')} Nova adesão</button>` : '')}
    <form id="filtros" class="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_200px]">
      <div class="relative"><span class="pointer-events-none absolute left-3 top-2.5 text-slate-400">${icone('busca', 'size-4')}</span>
        <input name="busca" value="${esc(filtrosBenef.busca)}" placeholder="Nome, CPF, contrato ou carteirinha" class="${cls.input} pl-9"></div>
      <select name="status" class="${cls.input}">${opcoes([['', 'Todos os status'], ...['ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'PENDENTE_ATIVACAO', 'CANCELADA'].map((s) => [s, rotuloStatus(s)])], filtrosBenef.status)}</select>
      <select name="planoId" class="${cls.input}">${opcoes([['', 'Todos os planos'], ...planos.map((p) => [p.id, p.nome])], filtrosBenef.planoId)}</select>
    </form>
    <div id="lista">${carregando()}</div>`;

  const form = conteudo().querySelector('#filtros');
  const atualizar = async () => {
    filtrosBenef = dadosForm(form);
    const lista = await api.admin.contratos(filtrosBenef);
    const exibidos = lista.slice(0, 150);
    conteudo().querySelector('#lista').innerHTML =
      `<p class="mb-2 text-xs text-slate-500">${fmt.numero(lista.length)} contrato(s)${lista.length > exibidos.length ? ` · exibindo os ${exibidos.length} mais recentes` : ''}</p>` +
      tabela(
        ['Contrato', 'Titular', 'Plano', 'Vidas', '>Mensalidade', 'Status', '>Em aberto'],
        exibidos.map(
          (c) => `<tr class="cursor-pointer hover:bg-slate-50" data-ir="#/beneficiarios/${c.id}">
            <td class="${cls.td} font-mono text-xs">${esc(c.numeroContrato)}</td>
            <td class="${cls.td}"><div class="flex items-center gap-3">${avatar(c.titular.nome)}<div><p class="font-semibold text-slate-900">${esc(c.titular.nome)}</p><p class="text-xs text-slate-500">${fmt.cpf(c.titular.cpf)}</p></div></div></td>
            <td class="${cls.td}">${esc(c.plano.nome)}</td>
            <td class="${cls.td}">${c.qtdBeneficiarios}</td>
            <td class="${cls.td} text-right">${fmt.moeda(c.valorMensalidade)}</td>
            <td class="${cls.td}">${badge(c.status)}</td>
            <td class="${cls.td} text-right ${c.faturasVencidas ? 'font-semibold text-red-700' : 'text-slate-400'}">${c.faturasVencidas ? `${fmt.moeda(c.valorEmAberto)}` : '—'}</td>
          </tr>`,
        ),
      );
  };
  form.addEventListener('input', debounce(atualizar, 250));
  form.addEventListener('submit', (e) => e.preventDefault());
  conteudo().addEventListener('click', (e) => {
    const tr = e.target.closest('[data-ir]');
    if (tr) location.hash = tr.dataset.ir;
  });
  conteudo().querySelector('#nova-adesao')?.addEventListener('click', () => abrirNovaAdesao(planos));
  await atualizar();
}

function abrirNovaAdesao(planos) {
  const m = modal({ titulo: 'Nova adesão', corpo: formularioAdesao(planos), largura: 'max-w-3xl' });
  ligarFormularioAdesao(m.el.querySelector('form'), planos, async (dados) => {
    const a = await api.admin.criarAdesao({ ...dados, canal: 'RECEPCAO' });
    m.fechar();
    toast(`Contrato ${a.numeroContrato} criado. 1ª mensalidade gerada.`);
    location.hash = `#/beneficiarios/${a.id}`;
  });
}

async function paginaContrato({ id }) {
  conteudo().innerHTML = carregando();
  const c = await api.admin.contrato(id);
  const gerencia = api.pode('beneficiarios.gerenciar');
  const acoes = {
    PENDENTE_ATIVACAO: [['ATIVAR', 'Ativar contrato', 'primario']],
    ATIVA: [['SUSPENDER', 'Suspender', 'secundario']],
    INADIMPLENTE: [['REATIVAR', 'Liberar benefícios', 'secundario'], ['SUSPENDER', 'Suspender', 'secundario']],
    SUSPENSA: [['REATIVAR', 'Reativar', 'primario']],
  }[c.status] ?? [];
  if (c.status !== 'CANCELADA') acoes.push(['CANCELAR', 'Cancelar contrato', 'fantasma']);

  conteudo().innerHTML = `
    <a href="#/beneficiarios" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">${icone('voltar', 'size-4')} Beneficiários</a>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div class="flex items-center gap-4">${avatar(c.titular.nome, 'size-14 text-base')}
        <div><div class="flex flex-wrap items-center gap-2"><h1 class="text-2xl font-extrabold text-slate-900">${esc(c.titular.nome)}</h1>${badge(c.status)}</div>
        <p class="text-sm text-slate-500">Contrato <span class="font-mono">${esc(c.numeroContrato)}</span> · ${esc(c.plano.nome)} · desde ${fmt.data(c.inicioVigencia)}${c.responsavelVenda ? ` · vendido por ${esc(c.responsavelVenda)}` : ''}</p></div>
      </div>
      ${gerencia ? `<div class="flex flex-wrap gap-2">${acoes.map(([a, r, v]) => `<button data-acao="${a}" class="${btn(v)}">${r}</button>`).join('')}</div>` : ''}
    </div>
    ${c.status === 'PENDENTE_ATIVACAO' ? `<div class="mb-4 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200">Pré-adesão feita pela rede credenciada. Confira os dados e ative o contrato para liberar a carteirinha e gerar a 1ª mensalidade.</div>` : ''}

    <div class="grid gap-4 lg:grid-cols-3">
      <section class="${cls.card} p-5">
        <h2 class="font-semibold">Dados do contrato</h2>
        <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          ${[['Mensalidade', fmt.moeda(c.valorMensalidade)], ['Vencimento', `Dia ${c.diaVencimento}`], ['Pagamento', { PIX: 'Pix', BOLETO: 'Boleto', CARTAO_CREDITO: 'Cartão' }[c.metodoPagamentoPreferido]], ['Canal de venda', c.canalVenda], ['Celular', fmt.telefone(c.titular.celular)], ['E-mail', esc(c.titular.email ?? '—')], ['Bairro', esc(c.titular.bairro ?? '—')], ['Em aberto', c.valorEmAberto ? fmt.moeda(c.valorEmAberto) : '—']].map(([k, v]) => `<div><dt class="text-xs text-slate-500">${k}</dt><dd class="font-medium text-slate-800 break-words">${v}</dd></div>`).join('')}
        </dl>
        ${c.motivoCancelamento ? `<p class="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Cancelado em ${fmt.data(c.canceladaEm)}: ${esc(c.motivoCancelamento)}</p>` : ''}
      </section>

      <section class="${cls.card} p-5 lg:col-span-2">
        <div class="flex items-center justify-between"><h2 class="font-semibold">Beneficiários (${c.beneficiarios.length})</h2>
        ${gerencia && c.status !== 'CANCELADA' ? `<button id="add-dep" class="${btn('secundario', 'py-1.5 text-xs')}">${icone('dependente', 'size-4')} Incluir dependente</button>` : ''}</div>
        <ul class="mt-3 divide-y divide-slate-100">${c.beneficiarios.map((b) => `
          <li class="flex flex-wrap items-center gap-3 py-3">
            ${avatar(b.pessoa.nome)}
            <div class="min-w-0 flex-1"><p class="font-semibold text-slate-900">${esc(b.pessoa.nome)}</p>
              <p class="text-xs text-slate-500">${b.tipo === 'TITULAR' ? 'Titular' : ROTULO_PARENTESCO[b.parentesco] ?? 'Dependente'} · ${b.idade} anos · ${b.pessoa.cpf ? fmt.cpf(b.pessoa.cpf) : 'sem CPF'} · <span class="font-mono">${esc(b.numeroCarteirinha)}</span> · v${b.versaoCarteirinha}</p></div>
            <div class="flex items-center gap-2">${badge(b.elegibilidade.resultado)}
            ${gerencia && b.status !== 'CANCELADO' ? `<button data-reemitir="${b.id}" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer" title="Reemitir carteirinha (invalida QR antigo)">${icone('recarregar', 'size-4')}</button>` : ''}</div>
          </li>`).join('')}</ul>
      </section>
    </div>

    <section class="mt-4">
      <h2 class="mb-2 font-semibold">Faturas</h2>
      ${tabela(['Número', 'Competência', 'Vencimento', '>Valor', 'Status', 'Pagamento', ''], c.faturas.map((f) => linhaFatura(f)), { vazioTexto: 'Nenhuma fatura gerada.' })}
    </section>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <section><h2 class="mb-2 font-semibold">Uso de benefícios</h2>
        ${c.transacoes.length ? `<div class="${cls.card} divide-y divide-slate-100">${c.transacoes.map((t) => `<div class="flex items-center gap-3 px-4 py-3 text-sm"><span class="text-slate-400">${icone(ICONE_CATEGORIA[t.categoria], 'size-5')}</span><div class="min-w-0 flex-1"><p class="truncate font-medium">${esc(t.descricaoItem)}</p><p class="truncate text-xs text-slate-500">${esc(t.pessoa.nome.split(' ')[0])} · ${esc(t.estabelecimento.nome)} · ${fmt.dataHora(t.ocorridaEm)}</p></div><div class="text-right"><p class="font-semibold ${t.valorDesconto < 0 ? 'text-slate-500' : 'text-emerald-700'}">${t.valorDesconto < 0 ? 'estorno ' : '−'}${fmt.moeda(Math.abs(t.valorDesconto))}</p><p class="text-xs text-slate-500">pagou ${fmt.moeda(t.valorPagoBeneficiario)}</p></div></div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Nenhum uso registrado.')}</div>`}
      </section>
      <section><h2 class="mb-2 font-semibold">Agendamentos</h2>
        ${c.agendamentos.length ? `<div class="${cls.card} divide-y divide-slate-100">${c.agendamentos.map((a) => `<div class="flex items-center gap-3 px-4 py-3 text-sm"><span class="text-slate-400">${icone('calendario', 'size-5')}</span><div class="min-w-0 flex-1"><p class="truncate font-medium">${esc(a.profissional?.nomeExibicao ?? a.especialidade?.nome ?? 'Atendimento')}</p><p class="truncate text-xs text-slate-500">${esc(a.pessoa.nome.split(' ')[0])} · ${esc(a.estabelecimento.nome)} · ${fmt.dataHora(a.inicio)}</p></div>${badge(a.status)}</div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Sem agendamentos.')}</div>`}
      </section>
    </div>`;

  const el = conteudo();
  el.querySelectorAll('[data-acao]').forEach((b) =>
    b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      const textos = { ATIVAR: 'Ativar o contrato e gerar a primeira mensalidade?', SUSPENDER: 'Suspender os benefícios de todos os beneficiários deste contrato?', REATIVAR: 'Reativar os benefícios deste contrato?', CANCELAR: 'Cancelar este contrato? As faturas em aberto serão canceladas.' };
      const r = await confirmar(textos[acao], { titulo: b.textContent, perigo: acao === 'CANCELAR', pedirMotivo: acao === 'CANCELAR', textoOk: b.textContent });
      if (!r) return;
      try {
        await api.admin.alterarStatusContrato(id, acao, typeof r === 'string' ? r : '');
        toast('Contrato atualizado.');
        renderizarRota();
      } catch (e) {
        tratarErro(e);
      }
    }),
  );
  el.querySelectorAll('[data-reemitir]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar('A carteirinha atual e o QR Code deixam de valer imediatamente. Continuar?', { titulo: 'Reemitir carteirinha', textoOk: 'Reemitir' }))) return;
      await api.admin.reemitirCarteirinha(b.dataset.reemitir).catch(tratarErro);
      toast('Nova via emitida.');
      renderizarRota();
    }),
  );
  el.querySelector('#add-dep')?.addEventListener('click', () => {
    const m = modal({
      titulo: 'Incluir dependente',
      corpo: `<form class="space-y-3" novalidate>${blocoDependente(0).replace(/data-campo/g, 'name').replace(/<button[^>]*data-remover-dep[^>]*>.*?<\/button>/, '')}
        <p class="text-xs text-slate-500">Plano ${esc(c.plano.nome)}: ${c.plano.dependentesInclusos} incluso(s), máximo ${c.plano.maxDependentes}. Adicional: ${fmt.moeda(c.plano.valorDependenteAdicional)}/mês.</p>
        <div class="flex justify-end gap-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Incluir</button></div></form>`,
    });
    const form = m.el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      comCarregando(form.querySelector('button:not([type])'), async () => {
        try {
          await api.admin.adicionarDependente(id, dadosForm(form));
          m.fechar();
          toast('Dependente incluído.');
          renderizarRota();
        } catch (err) {
          tratarErro(err);
        }
      });
    });
  });
  ligarAcoesFatura(el, c.faturas);
}

function linhaFatura(f, { mostrarTitular = false } = {}) {
  const pendente = f.cobrancas?.find((x) => x.status === 'PENDENTE');
  const pode = api.pode('financeiro.gerenciar') && ['ABERTA', 'VENCIDA'].includes(f.status);
  return `<tr>
    <td class="${cls.td} font-mono text-xs">${esc(f.numero)}</td>
    ${mostrarTitular ? `<td class="${cls.td}"><a class="font-medium text-slate-900 hover:underline" href="#/beneficiarios/${f.assinaturaId}">${esc(f.titular.nome)}</a><p class="text-xs text-slate-500">${esc(f.plano.nome)}</p></td>` : ''}
    <td class="${cls.td} capitalize">${f.competencia ? fmt.mes(f.competencia) : '—'}</td>
    <td class="${cls.td}">${fmt.data(f.vencimento)}</td>
    <td class="${cls.td} text-right font-semibold">${fmt.moeda(f.valorTotal)}${Number(f.valorMulta) ? `<p class="text-[11px] font-normal text-slate-500">c/ multa e juros</p>` : ''}</td>
    <td class="${cls.td}">${badge(f.status)}</td>
    <td class="${cls.td} text-xs text-slate-500">${f.pagaEm ? `${{ PIX: 'Pix', BOLETO: 'Boleto', CARTAO_CREDITO: 'Cartão' }[f.metodoPagamento] ?? ''} · ${fmt.data(f.pagaEm)}` : pendente ? `${pendente.metodo === 'PIX' ? 'Pix' : pendente.metodo === 'BOLETO' ? 'Boleto' : 'Cartão'} emitido` : '—'}</td>
    <td class="${cls.td} text-right">${pode ? `<button data-cobrar="${f.id}" class="${btn('secundario', 'py-1 text-xs')}">${pendente ? 'Ver cobrança' : 'Cobrar'}</button>` : ''}</td>
  </tr>`;
}

/** Idempotente: o mesmo contêiner pode ser re-renderizado pelos filtros sem duplicar o listener. */
function ligarAcoesFatura(el, faturas) {
  el._faturas = faturas;
  if (el._ligado) return;
  el._ligado = true;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cobrar]');
    if (!b) return;
    const fatura = el._faturas.find((f) => f.id === b.dataset.cobrar);
    const pendente = fatura.cobrancas?.find((c) => c.status === 'PENDENTE');
    abrirCobranca({ fatura, metodo: pendente?.metodo, emitir: api.admin.emitirCobranca, pagar: api.admin.simularPagamento, aoPagar: renderizarRota });
  });
}

// ---- Planos ----------------------------------------------------------------------------

async function paginaPlanos() {
  conteudo().innerHTML = carregando();
  const [planos, catalogo] = await Promise.all([api.admin.planos(), api.admin.catalogo()]);
  const gerencia = api.pode('planos.gerenciar');
  const rotAbr = { PROPRIA: 'rede própria', CREDENCIADA: 'credenciados', TODAS: 'toda a rede' };
  conteudo().innerHTML = `
    ${cabecalho('Planos e benefícios', 'Mensalidade, dependentes, carências e regras de desconto/coparticipação por plano', gerencia ? `<button data-plano class="${btn()}">${icone('mais', 'size-4')} Novo plano</button>` : '')}
    <div class="grid gap-4 xl:grid-cols-2">${planos.map((p) => `
      <article class="${cls.card} overflow-hidden">
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 p-5" style="border-top:4px solid ${esc(p.corDestaque)}">
          <div><div class="flex items-center gap-2"><h2 class="text-lg font-bold">${esc(p.nome)}</h2>${p.publicado ? badge('ATIVO', 'Publicado') : badge('CANCELADO', 'Oculto')}</div>
            <p class="mt-0.5 text-sm text-slate-500">${esc(p.descricao)}</p>
            <p class="mt-2 text-xs text-slate-500">${p.dependentesInclusos} dependente(s) incluso(s) · máx. ${p.maxDependentes} · adicional ${fmt.moeda(p.valorDependenteAdicional)} · carência ${p.carenciaPadraoDias} dias${p.idadeMinima ? ` · ${p.idadeMinima}+ anos` : ''}${p.cashbackPercentual ? ` · cashback ${p.cashbackPercentual}%` : ''}</p></div>
          <div class="text-right"><p class="text-2xl font-extrabold">${fmt.moeda(p.valorMensalidade)}</p><p class="text-xs text-slate-500">/mês · ${p.assinantes} contratos</p>
            ${gerencia ? `<button data-plano="${p.id}" class="mt-2 text-xs font-semibold text-marca hover:underline cursor-pointer">Editar plano</button>` : ''}</div>
        </div>
        <ul class="divide-y divide-slate-100">${p.regras
          .sort((a, b) => (a.categoria ?? a.item?.categoria).localeCompare(b.categoria ?? b.item?.categoria) || Number(!!b.itemCatalogoId) - Number(!!a.itemCatalogoId))
          .map((r) => `<li class="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span class="text-slate-400">${icone(ICONE_CATEGORIA[r.categoria ?? r.item.categoria], 'size-4')}</span>
            <span class="min-w-0 flex-1"><span class="font-medium text-slate-800">${esc(r.item ? r.item.nome : ROTULO_CATEGORIA[r.categoria])}</span>
              <span class="block text-xs text-slate-500">${r.item ? 'Regra do item' : 'Toda a categoria'} · ${rotAbr[r.abrangencia]}${r.carenciaDias ? ` · carência ${r.carenciaDias}d` : ''}${r.aplicaDependentes ? '' : ' · só titular'}</span></span>
            <span class="rounded-md bg-marca-clara px-2 py-0.5 text-xs font-semibold text-marca">${esc(descreverRegra(r))}</span>
            ${gerencia ? `<button data-regra="${r.id}" data-plano-id="${p.id}" class="text-slate-300 hover:text-slate-600 cursor-pointer" title="Editar">${icone('seta', 'size-4')}</button>` : ''}
          </li>`).join('')}</ul>
        ${gerencia ? `<div class="border-t border-slate-100 p-3"><button data-nova-regra="${p.id}" class="${btn('fantasma', 'w-full py-1.5 text-xs')}">${icone('mais', 'size-3.5')} Adicionar regra de benefício</button></div>` : ''}
      </article>`).join('')}</div>`;

  const el = conteudo();
  el.querySelectorAll('[data-plano]').forEach((b) => b.addEventListener('click', () => editarPlano(planos.find((p) => p.id === b.dataset.plano))));
  el.querySelectorAll('[data-nova-regra]').forEach((b) => b.addEventListener('click', () => editarRegra({ planoId: b.dataset.novaRegra }, catalogo)));
  el.querySelectorAll('[data-regra]').forEach((b) => b.addEventListener('click', () => editarRegra(planos.find((p) => p.id === b.dataset.planoId).regras.find((r) => r.id === b.dataset.regra), catalogo)));
}

function editarPlano(p = {}) {
  const m = modal({
    titulo: p.id ? `Editar plano ${p.nome}` : 'Novo plano',
    largura: 'max-w-2xl',
    corpo: `<form class="grid gap-3 sm:grid-cols-2" novalidate>
      ${campo('Nome', `<input name="nome" required value="${esc(p.nome ?? '')}" class="${cls.input}">`)}
      ${campo('Mensalidade (R$)', `<input name="valorMensalidade" type="number" step="0.01" min="0" required value="${p.valorMensalidade ?? ''}" class="${cls.input}">`)}
      <div class="sm:col-span-2">${campo('Descrição', `<input name="descricao" value="${esc(p.descricao ?? '')}" class="${cls.input}">`)}</div>
      ${campo('Dependentes inclusos', `<input name="dependentesInclusos" type="number" min="0" value="${p.dependentesInclusos ?? 0}" class="${cls.input}">`)}
      ${campo('Máximo de dependentes', `<input name="maxDependentes" type="number" min="0" value="${p.maxDependentes ?? 0}" class="${cls.input}">`)}
      ${campo('Valor por dependente adicional', `<input name="valorDependenteAdicional" type="number" step="0.01" min="0" value="${p.valorDependenteAdicional ?? 0}" class="${cls.input}">`)}
      ${campo('Carência geral (dias)', `<input name="carenciaPadraoDias" type="number" min="0" value="${p.carenciaPadraoDias ?? 0}" class="${cls.input}">`)}
      ${campo('Idade mínima do titular', `<input name="idadeMinima" type="number" min="0" value="${p.idadeMinima ?? ''}" class="${cls.input}">`)}
      ${campo('Nível (ordem de exibição)', `<input name="nivel" type="number" min="1" value="${p.nivel ?? 1}" class="${cls.input}">`)}
      ${campo('Cor do plano', `<input name="corDestaque" type="color" value="${esc(p.corDestaque ?? '#0F766E')}" class="h-10 w-full rounded-lg border border-slate-300">`)}
      <label class="flex items-center gap-2 self-end pb-2 text-sm"><input name="publicado" type="checkbox" ${p.publicado !== false ? 'checked' : ''} class="size-4 accent-[var(--marca)]"> Publicado no app e na venda pela rede</label>
      <input type="hidden" name="id" value="${esc(p.id ?? '')}"><input type="hidden" name="codigo" value="${esc(p.codigo ?? '')}">
      <div class="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Salvar plano</button></div>
    </form>`,
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        await api.admin.salvarPlano(dadosForm(form));
        m.fechar();
        toast('Plano salvo.');
        renderizarRota();
      } catch (err) {
        tratarErro(err);
      }
    });
  });
}

function editarRegra(r, catalogo) {
  const categorias = Object.keys(ROTULO_CATEGORIA).filter((c) => catalogo.some((i) => i.categoria === c));
  const m = modal({
    titulo: r.id ? 'Editar regra de benefício' : 'Nova regra de benefício',
    largura: 'max-w-2xl',
    corpo: `<form class="grid gap-3 sm:grid-cols-2" novalidate>
      ${campo('Aplicar a', `<select name="escopo" class="${cls.input}">${opcoes([['CATEGORIA', 'Uma categoria inteira'], ['ITEM', 'Um serviço específico']], r.itemCatalogoId ? 'ITEM' : 'CATEGORIA')}</select>`)}
      <div data-escopo="CATEGORIA">${campo('Categoria', `<select name="categoria" class="${cls.input}">${opcoes(categorias.map((c) => [c, ROTULO_CATEGORIA[c]]), r.categoria)}</select>`)}</div>
      <div data-escopo="ITEM" class="hidden">${campo('Serviço', `<select name="itemCatalogoId" class="${cls.input}">${opcoes(catalogo.map((i) => [i.id, `${i.nome} (${ROTULO_CATEGORIA[i.categoria]})`]), r.itemCatalogoId)}</select>`)}</div>
      ${campo('Tipo de regra', `<select name="tipoRegra" class="${cls.input}">${opcoes(Object.entries({ INCLUSO: 'Incluso no plano (gratuito)', DESCONTO_PERCENTUAL: 'Desconto %', PRECO_FIXO: 'Preço fixo (R$)', COPARTICIPACAO_PERCENTUAL: 'Coparticipação %', COPARTICIPACAO_VALOR: 'Coparticipação (R$)' }), r.tipoRegra ?? 'DESCONTO_PERCENTUAL')}</select>`)}
      ${campo('Valor (% ou R$)', `<input name="valor" type="number" step="0.01" min="0" value="${r.valor ?? 0}" class="${cls.input}">`)}
      ${campo('Onde vale', `<select name="abrangencia" class="${cls.input}">${opcoes([['TODAS', 'Toda a rede'], ['PROPRIA', 'Somente rede própria'], ['CREDENCIADA', 'Somente credenciados']], r.abrangencia)}</select>`)}
      ${campo('Carência específica (dias)', `<input name="carenciaDias" type="number" min="0" value="${r.carenciaDias ?? ''}" class="${cls.input}">`)}
      ${campo('Limite de usos', `<input name="limiteQuantidade" type="number" min="0" value="${r.limiteQuantidade ?? ''}" class="${cls.input}" placeholder="Sem limite">`)}
      ${campo('Período do limite', `<select name="periodicidadeLimite" class="${cls.input}">${opcoes([['MES', 'Por mês'], ['ANO', 'Por ano'], ['DIA', 'Por dia'], ['VIGENCIA', 'Na vigência']], r.periodicidadeLimite ?? 'MES')}</select>`)}
      <label class="flex items-center gap-2 text-sm sm:col-span-2"><input name="aplicaDependentes" type="checkbox" ${r.aplicaDependentes !== false ? 'checked' : ''} class="size-4"> Vale também para dependentes</label>
      <div class="flex justify-between gap-2 border-t border-slate-100 pt-4 sm:col-span-2">
        ${r.id ? `<button type="button" data-remover class="${btn('fantasma', 'text-red-600')}">Remover regra</button>` : '<span></span>'}
        <div class="flex gap-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Salvar regra</button></div>
      </div>
    </form>`,
  });
  const form = m.el.querySelector('form');
  const sincronizar = () => m.el.querySelectorAll('[data-escopo]').forEach((d) => d.classList.toggle('hidden', d.dataset.escopo !== form.escopo.value));
  form.escopo.addEventListener('change', sincronizar);
  sincronizar();
  m.el.querySelector('[data-remover]')?.addEventListener('click', async () => {
    await api.admin.removerRegra(r.id).catch(tratarErro);
    m.fechar();
    toast('Regra removida.');
    renderizarRota();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = dadosForm(form);
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        await api.admin.salvarRegra({ ...d, id: r.id, planoId: r.planoId, itemCatalogoId: d.escopo === 'ITEM' ? d.itemCatalogoId : null, categoria: d.escopo === 'CATEGORIA' ? d.categoria : null });
        m.fechar();
        toast('Regra salva.');
        renderizarRota();
      } catch (err) {
        tratarErro(err);
      }
    });
  });
}

// ---- Rede credenciada ---------------------------------------------------------------------

let filtroRede = 'TODOS';

async function paginaRede() {
  conteudo().innerHTML = carregando();
  const rede = await api.admin.rede();
  const gerencia = api.pode('rede.gerenciar');
  const filtros = { TODOS: () => true, EM_ANALISE: (e) => e.status === 'EM_ANALISE', PROPRIO: (e) => e.natureza === 'PROPRIO', CREDENCIADO: (e) => e.natureza === 'CREDENCIADO' && e.status !== 'EM_ANALISE' };
  const lista = rede.filter(filtros[filtroRede]);
  const conta = (k) => rede.filter(filtros[k]).length;
  conteudo().innerHTML = `
    ${cabecalho('Rede credenciada', 'Unidades próprias, clínicas, laboratórios, farmácias e consultórios parceiros')}
    <div class="mb-4 flex flex-wrap gap-2">${[['TODOS', 'Todos'], ['EM_ANALISE', 'Em análise'], ['CREDENCIADO', 'Credenciados'], ['PROPRIO', 'Rede própria']].map(([k, r]) => `<button data-filtro="${k}" class="rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer ${filtroRede === k ? 'bg-marca text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">${r} <span class="opacity-70">${conta(k)}</span></button>`).join('')}</div>
    ${tabela(['Estabelecimento', 'Tipo', 'Bairro', 'Status', '>Usos 30d', '>Descontos 30d', 'Avaliação', ''], lista.map((e) => `
      <tr class="${e.status === 'EM_ANALISE' ? 'bg-amber-50/50' : ''}">
        <td class="${cls.td}"><p class="font-semibold text-slate-900">${esc(e.nome)}</p><p class="text-xs text-slate-500">${fmt.cnpj(e.documento)}${e.matriz ? ` · filial de ${esc(e.matriz.nome)}` : ''}</p></td>
        <td class="${cls.td}"><p>${esc(ROTULO_TIPO_ESTAB[e.tipo])}</p>${badge(e.natureza)}</td>
        <td class="${cls.td}">${esc(e.bairro ?? '—')}</td>
        <td class="${cls.td}">${badge(e.status)}</td>
        <td class="${cls.td} text-right">${e.usos30d}</td>
        <td class="${cls.td} text-right">${fmt.moeda(e.economia30d)}</td>
        <td class="${cls.td}">${e.notaMedia ? `<span class="inline-flex items-center gap-1">${estrelas(e.notaMedia, 'size-3.5')}<span class="text-xs text-slate-500">${Number(e.notaMedia).toFixed(1)} (${e.totalAvaliacoes})</span></span>` : '<span class="text-xs text-slate-400">—</span>'}</td>
        <td class="${cls.td} text-right"><button data-detalhe="${e.id}" class="${btn('secundario', 'py-1 text-xs')}">${e.status === 'EM_ANALISE' && gerencia ? 'Analisar' : 'Detalhes'}</button></td>
      </tr>`), { vazioTexto: 'Nenhum estabelecimento neste filtro.' })}`;

  conteudo().querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => ((filtroRede = b.dataset.filtro), paginaRede())));
  conteudo().querySelectorAll('[data-detalhe]').forEach((b) =>
    b.addEventListener('click', () => {
      const e = rede.find((x) => x.id === b.dataset.detalhe);
      const acoes = gerencia ? { EM_ANALISE: [['ATIVO', 'Aprovar credenciamento', 'primario'], ['DESCREDENCIADO', 'Recusar', 'fantasma']], ATIVO: [['SUSPENSO', 'Suspender', 'secundario'], ['DESCREDENCIADO', 'Descredenciar', 'fantasma']], SUSPENSO: [['ATIVO', 'Reativar', 'primario'], ['DESCREDENCIADO', 'Descredenciar', 'fantasma']] }[e.status] ?? [] : [];
      const m = modal({
        titulo: e.nome,
        largura: 'max-w-xl',
        corpo: `<div class="flex flex-wrap gap-2">${badge(e.status)}${badge(e.natureza)}<span class="text-sm text-slate-500">${esc(ROTULO_TIPO_ESTAB[e.tipo])}</span></div>
          <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
            ${[['Documento', fmt.cnpj(e.documento)], ['Telefone', fmt.telefone(e.telefone)], ['E-mail', esc(e.email ?? '—')], ['Endereço', esc([e.logradouro, e.numero, e.bairro].filter(Boolean).join(', ') || '—')], ['Funcionamento', esc(e.horarioFuncionamento ?? '—')], ['Serviços na tabela', e.ofertas], ['Contrato desde', fmt.data(e.contratoInicio)], ['Solicitado em', fmt.data(e.criadoEm)]].map(([k, v]) => `<div><dt class="text-xs text-slate-500">${k}</dt><dd class="font-medium">${v}</dd></div>`).join('')}
          </dl>
          ${e.especialidadesInformadas ? `<p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>Serviços informados no cadastro:</b> ${esc(e.especialidadesInformadas)}</p>` : ''}
          <h3 class="mt-5 text-sm font-semibold">Acessos ao portal</h3>
          <ul class="mt-2 divide-y divide-slate-100 text-sm">${e.acessos.map((a) => `<li class="flex items-center justify-between py-2"><span>${esc(a.usuario.nome)} <span class="text-xs text-slate-500">${esc(a.usuario.email)}</span></span>${badge(a.status)}</li>`).join('') || '<li class="py-2 text-slate-500">Nenhum acesso.</li>'}</ul>
          ${e.status === 'EM_ANALISE' ? '<p class="mt-4 text-xs text-slate-500">Ao aprovar, o acesso do responsável é liberado e a tabela de preços é criada a partir dos valores de referência do catálogo.</p>' : ''}
          ${acoes.length ? `<div class="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">${acoes.map(([s, r, v]) => `<button data-status="${s}" class="${btn(v)}">${r}</button>`).join('')}</div>` : ''}`,
      });
      m.el.querySelectorAll('[data-status]').forEach((bt) =>
        bt.addEventListener('click', () =>
          comCarregando(bt, async () => {
            try {
              await api.admin.alterarStatusEstabelecimento(e.id, bt.dataset.status);
              m.fechar();
              toast('Estabelecimento atualizado.');
              renderizarRota();
            } catch (err) {
              tratarErro(err);
            }
          }),
        ),
      );
    }),
  );
}

// ---- Financeiro ------------------------------------------------------------------------------

let abaFin = 'faturas';
let filtrosFin = { status: '', competencia: '', busca: '' };

async function paginaFinanceiro() {
  const gerencia = api.pode('financeiro.gerenciar');
  const mesAtual = new Date().toISOString().slice(0, 7);
  conteudo().innerHTML = `
    ${cabecalho('Financeiro', 'Cobrança recorrente simulada (Pix, boleto e cartão), régua de cobrança e DRE', gerencia ? `
      <button id="gerar" class="${btn('secundario')}">${icone('fatura', 'size-4')} Gerar mensalidades</button>
      <button id="regua" class="${btn()}">${icone('sino', 'size-4')} Processar régua de cobrança</button>` : '')}
    <div class="mb-4 flex gap-1 border-b border-slate-200">${[['faturas', 'Faturas'], ['dre', 'DRE gerencial'], ['mensagens', 'Mensagens enviadas']].map(([k, r]) => `<button data-aba="${k}" class="-mb-px border-b-2 px-4 py-2 text-sm font-semibold cursor-pointer ${abaFin === k ? 'border-marca text-marca' : 'border-transparent text-slate-500 hover:text-slate-800'}">${r}</button>`).join('')}</div>
    <div id="aba">${carregando()}</div>`;
  const el = conteudo();
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => ((abaFin = b.dataset.aba), paginaFinanceiro())));
  el.querySelector('#gerar')?.addEventListener('click', () => {
    const m = modal({
      titulo: 'Gerar mensalidades',
      corpo: `<form class="space-y-4">${campo('Competência', `<input name="competencia" type="month" value="${mesAtual}" class="${cls.input}">`, 'Gera a fatura de cada contrato ativo que ainda não tem mensalidade nesta competência (operação idempotente).')}
        <div class="flex justify-end gap-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Gerar</button></div></form>`,
    });
    const f = m.el.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      comCarregando(f.querySelector('button:not([type])'), async () => {
        const n = await api.admin.gerarMensalidades(f.competencia.value).catch(tratarErro);
        m.fechar();
        toast(n ? `${n} mensalidade(s) gerada(s).` : 'Nenhuma fatura nova — todas já existiam.');
        paginaFinanceiro();
      });
    });
  });
  el.querySelector('#regua')?.addEventListener('click', (e) =>
    comCarregando(e.currentTarget, async () => {
      try {
        const r = await api.admin.processarRegua();
        modal({
          titulo: 'Régua de cobrança executada',
          corpo: `<ul class="space-y-2 text-sm">${[['Faturas marcadas como vencidas', r.vencidas], ['Contratos que ficaram inadimplentes', r.inadimplentes], ['Contratos suspensos (D+15)', r.suspensas], ['Contratos cancelados (D+60)', r.canceladas], ['Mensagens enviadas (simuladas)', r.mensagens]].map(([k, v]) => `<li class="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>${k}</span><b>${v}</b></li>`).join('')}</ul>
            <p class="mt-4 text-xs text-slate-500">No backend real esta rotina roda diariamente (job agendado). Etapas: D-3 e D0 lembrete, D+3 2ª via, D+15 suspensão, D+60 cancelamento.</p>`,
        });
        paginaFinanceiro();
      } catch (err) {
        tratarErro(err);
      }
    }),
  );

  const aba = el.querySelector('#aba');
  if (abaFin === 'faturas') {
    aba.innerHTML = `
      <form id="ff" class="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_180px]">
        <input name="busca" value="${esc(filtrosFin.busca)}" placeholder="Titular, nº da fatura ou contrato" class="${cls.input}">
        <select name="status" class="${cls.input}">${opcoes([['', 'Todos os status'], ...['ABERTA', 'VENCIDA', 'PAGA', 'CANCELADA'].map((s) => [s, rotuloStatus(s)])], filtrosFin.status)}</select>
        <input name="competencia" type="month" value="${esc(filtrosFin.competencia)}" class="${cls.input}">
      </form><div id="lista-fat">${carregando()}</div>`;
    const ff = aba.querySelector('#ff');
    const atualizar = async () => {
      filtrosFin = dadosForm(ff);
      const fats = await api.admin.faturas(filtrosFin);
      const ex = fats.slice(0, 200);
      const tot = (s) => fats.filter((f) => f.status === s).reduce((a, f) => a + Number(f.valorTotal), 0);
      aba.querySelector('#lista-fat').innerHTML = `
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">${kpi('Faturas', fmt.numero(fats.length))}${kpi('Em aberto', fmt.moeda(tot('ABERTA')))}${kpi('Vencidas', fmt.moeda(tot('VENCIDA')), '', 'text-red-700')}${kpi('Pagas', fmt.moeda(tot('PAGA')), '', 'text-emerald-700')}</div>
        ${fats.length > ex.length ? `<p class="mb-2 text-xs text-slate-500">Exibindo ${ex.length} de ${fmt.numero(fats.length)} — refine os filtros.</p>` : ''}
        ${tabela(['Número', 'Titular', 'Competência', 'Vencimento', '>Valor', 'Status', 'Pagamento', ''], ex.map((f) => linhaFatura(f, { mostrarTitular: true })))}`;
      ligarAcoesFatura(aba.querySelector('#lista-fat'), ex);
    };
    ff.addEventListener('input', debounce(atualizar, 250));
    ff.addEventListener('submit', (e) => e.preventDefault());
    await atualizar();
  } else if (abaFin === 'dre') {
    const dre = await api.admin.dre(6);
    const linhas = [
      ['Mensalidades recebidas', 'mensalidades'], ['Taxas de intermediação (parceiros)', 'taxasParceiros'], ['Serviços pagos na rede própria', 'servicosProprios'],
      ['= Receita bruta', 'receitaBruta', 'font-bold border-t border-slate-200'], ['(−) Taxas do gateway (simuladas)', 'taxasGateway', 'text-red-700'],
      ['(−) Repasses a credenciados', 'repasses', 'text-red-700'], ['(−) Comissões de profissionais', 'comissoes', 'text-red-700'], ['= Resultado', 'resultado', 'font-extrabold border-t-2 border-slate-300'],
    ];
    aba.innerHTML = `<div class="${cls.card} overflow-x-auto rolagem-fina"><table class="w-full min-w-[760px] text-sm">
      <thead class="bg-slate-50/70"><tr><th class="${cls.th}">Conta</th>${dre.map((m) => `<th class="${cls.th} text-right capitalize">${fmt.mes(m.mes)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(([r, k, c = '']) => `<tr class="${c}"><td class="px-4 py-2.5">${r}</td>${dre.map((m) => `<td class="px-4 py-2.5 text-right tabular-nums">${fmt.moeda(m[k])}</td>`).join('')}</tr>`).join('')}
      <tr><td class="px-4 py-2.5 text-slate-500">Margem</td>${dre.map((m) => `<td class="px-4 py-2.5 text-right text-slate-500">${fmt.pct(m.margem)}</td>`).join('')}</tr></tbody></table></div>
      <p class="mt-3 text-xs text-slate-500">Regime de caixa para mensalidades e competência para transações B2B. Taxas de gateway estimadas: Pix 0,99%, boleto R$ 1,99, cartão 2,99%.</p>`;
  } else {
    const ns = await api.admin.notificacoes();
    aba.innerHTML = tabela(['Data', 'Canal', 'Destinatário', 'Mensagem', 'Status'], ns.map((n) => `<tr><td class="${cls.td} whitespace-nowrap text-xs">${fmt.dataHora(n.enviadaEm ?? n.criadoEm)}</td><td class="${cls.td}">${esc(n.canal)}</td><td class="${cls.td}">${esc(n.pessoa?.nome ?? '—')}<p class="text-xs text-slate-500">${esc(n.destino)}</p></td><td class="${cls.td} max-w-md text-xs">${esc(n.conteudo)}</td><td class="${cls.td}">${badge(n.status)}</td></tr>`), { vazioTexto: 'Nenhuma mensagem. Rode a régua de cobrança.' }) + '<p class="mt-3 text-xs text-slate-500">Simulação da WhatsApp Business Cloud API — nenhuma mensagem real é enviada.</p>';
  }
}

// ---- Extrato B2B ------------------------------------------------------------------------------

let filtrosB2B = { estabelecimentoId: '', de: '', ate: '', categoria: '' };

async function paginaB2B() {
  conteudo().innerHTML = carregando();
  const [rede, lotes] = await Promise.all([api.admin.rede(), api.admin.lotes()]);
  const gerencia = api.pode('b2b.gerenciar');
  conteudo().innerHTML = `
    ${cabecalho('Extrato B2B e repasses', 'Quem concedeu cada desconto, para quem, com qual regra — e a conciliação com cada parceiro', `<button id="csv" class="${btn('secundario')}">Exportar CSV</button>`)}
    <form id="fb" class="mb-4 grid gap-3 sm:grid-cols-4">
      <select name="estabelecimentoId" class="${cls.input}">${opcoes([['', 'Todos os estabelecimentos'], ...rede.map((e) => [e.id, e.nome])], filtrosB2B.estabelecimentoId)}</select>
      <select name="categoria" class="${cls.input}">${opcoes([['', 'Todas as categorias'], ...Object.entries(ROTULO_CATEGORIA)], filtrosB2B.categoria)}</select>
      <input name="de" type="date" value="${esc(filtrosB2B.de)}" class="${cls.input}" aria-label="De">
      <input name="ate" type="date" value="${esc(filtrosB2B.ate)}" class="${cls.input}" aria-label="Até">
    </form>
    <div id="extrato">${carregando()}</div>

    <h2 class="mb-2 mt-8 text-lg font-bold">Conciliação e repasses</h2>
    <div class="grid gap-4 lg:grid-cols-2">
      <section><h3 class="mb-2 text-sm font-semibold text-slate-600">Em aberto (ainda sem lote)</h3>
        ${lotes.abertos.length ? `<div class="${cls.card} divide-y divide-slate-100">${lotes.abertos.map((a) => `<div class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><div class="min-w-0 flex-1"><p class="font-semibold">${esc(a.estabelecimento.nome)}</p><p class="text-xs text-slate-500">${a.quantidade} transações desde ${fmt.data(a.desde)} · repasse ${fmt.moeda(a.repasses)} · taxas ${fmt.moeda(a.taxas)}</p></div>
          <p class="text-right font-bold ${a.liquido >= 0 ? 'text-slate-900' : 'text-emerald-700'}">${a.liquido >= 0 ? `A pagar ${fmt.moeda(a.liquido)}` : `A receber ${fmt.moeda(-a.liquido)}`}</p>
          ${gerencia ? `<button data-fechar-lote="${a.estabelecimento.id}" class="${btn('secundario', 'py-1 text-xs')}">Fechar lote</button>` : ''}</div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Nada em aberto.')}</div>`}
      </section>
      <section><h3 class="mb-2 text-sm font-semibold text-slate-600">Lotes</h3>
        <div class="${cls.card} max-h-[420px] divide-y divide-slate-100 overflow-y-auto rolagem-fina">${lotes.lotes.map((l) => `<div class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><div class="min-w-0 flex-1"><p class="font-semibold">${esc(l.estabelecimento.nome)}</p><p class="text-xs text-slate-500">${fmt.data(l.periodoInicio)} a ${fmt.data(l.periodoFim)} · ${l.quantidadeTransacoes} transações</p></div>
          <div class="text-right"><p class="font-bold">${l.valorLiquido >= 0 ? fmt.moeda(l.valorLiquido) : `−${fmt.moeda(-l.valorLiquido)}`}</p><p class="text-[11px] text-slate-500">${l.valorLiquido >= 0 ? 'matriz paga' : 'parceiro paga'}</p></div>${badge(l.status)}
          ${gerencia && ['FECHADO', 'APROVADO'].includes(l.status) ? `<button data-avancar="${l.id}" class="${btn('secundario', 'py-1 text-xs')}">${l.status === 'FECHADO' ? 'Aprovar' : 'Marcar como pago'}</button>` : ''}</div>`).join('') || vazio('Nenhum lote.')}</div>
      </section>
    </div>`;

  const el = conteudo();
  const fb = el.querySelector('#fb');
  let ultimo = null;
  const atualizar = async () => {
    filtrosB2B = dadosForm(fb);
    const { transacoes, totais } = await api.admin.extratoB2B(filtrosB2B);
    ultimo = transacoes;
    const ex = transacoes.slice(0, 200);
    el.querySelector('#extrato').innerHTML = `
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">${kpi('Usos', fmt.numero(totais.quantidade))}${kpi('Valor de tabela', fmt.moeda(totais.valorOriginal))}${kpi('Descontos concedidos', fmt.moeda(totais.valorDesconto), '', 'text-emerald-700')}${kpi('Repasses (matriz → parceiro)', fmt.moeda(totais.repasses))}${kpi('Taxas (parceiro → matriz)', fmt.moeda(totais.taxas))}</div>
      ${transacoes.length > ex.length ? `<p class="mb-2 text-xs text-slate-500">Exibindo ${ex.length} de ${fmt.numero(transacoes.length)}.</p>` : ''}
      ${tabela(['Data', 'Autorização', 'Estabelecimento', 'Beneficiário', 'Item', '>Tabela', '>Desconto', '>Pago', '>Repasse/Taxa', 'Status'], ex.map((t) => `<tr class="${t.transacaoOriginalId ? 'bg-slate-50 text-slate-500' : ''}">
        <td class="${cls.td} whitespace-nowrap text-xs">${fmt.dataHora(t.ocorridaEm)}</td>
        <td class="${cls.td} font-mono text-xs">${esc(t.codigoAutorizacao)}</td>
        <td class="${cls.td}">${esc(t.estabelecimento.nome)}${t.profissional ? `<p class="text-xs text-slate-500">${esc(t.profissional.nomeExibicao)}</p>` : ''}</td>
        <td class="${cls.td}">${esc(t.pessoa.nome)}<p class="font-mono text-[11px] text-slate-500">${esc(t.beneficiario.numeroCarteirinha)}</p></td>
        <td class="${cls.td}">${esc(t.descricaoItem)}</td>
        <td class="${cls.td} text-right tabular-nums">${fmt.moeda(t.valorOriginal)}</td>
        <td class="${cls.td} text-right tabular-nums text-emerald-700">${fmt.moeda(t.valorDesconto)}</td>
        <td class="${cls.td} text-right tabular-nums">${fmt.moeda(t.valorPagoBeneficiario)}</td>
        <td class="${cls.td} text-right text-xs tabular-nums">${Number(t.valorRepasseParceiro) ? `repasse ${fmt.moeda(t.valorRepasseParceiro)}` : ''}${Number(t.valorTaxaMatriz) ? `taxa ${fmt.moeda(t.valorTaxaMatriz)}` : ''}${Number(t.valorComissaoProfissional) ? `comissão ${fmt.moeda(t.valorComissaoProfissional)}` : ''}</td>
        <td class="${cls.td}">${t.transacaoOriginalId ? badge('ESTORNADA', 'Estorno') : badge(t.status)}</td></tr>`))}`;
  };
  fb.addEventListener('input', debounce(atualizar, 250));
  el.querySelector('#csv').addEventListener('click', () => {
    if (!ultimo) return;
    const cab = ['data', 'autorizacao', 'estabelecimento', 'profissional', 'beneficiario', 'carteirinha', 'item', 'categoria', 'valor_original', 'valor_desconto', 'valor_pago', 'repasse_parceiro', 'taxa_matriz', 'comissao_profissional', 'status'];
    const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const linhas = ultimo.map((t) => [t.ocorridaEm, t.codigoAutorizacao, t.estabelecimento.nome, t.profissional?.nomeExibicao, t.pessoa.nome, t.beneficiario.numeroCarteirinha, t.descricaoItem, t.categoria, t.valorOriginal, t.valorDesconto, t.valorPagoBeneficiario, t.valorRepasseParceiro, t.valorTaxaMatriz, t.valorComissaoProfissional, t.transacaoOriginalId ? 'ESTORNO' : t.status].map(q).join(';'));
    const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `extrato-b2b-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  el.querySelectorAll('[data-fechar-lote]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar('Fechar o lote com todas as transações em aberto deste parceiro? Depois disso, estornos só pelo hospital.', { titulo: 'Fechar lote de repasse', textoOk: 'Fechar lote' }))) return;
      try {
        const l = await api.admin.fecharLote(b.dataset.fecharLote);
        toast(`Lote fechado: ${l.quantidadeTransacoes} transações.`);
        paginaB2B();
      } catch (e) {
        tratarErro(e);
      }
    }),
  );
  el.querySelectorAll('[data-avancar]').forEach((b) => b.addEventListener('click', async () => (await api.admin.avancarLote(b.dataset.avancar).catch(tratarErro), toast('Lote atualizado.'), paginaB2B())));
  await atualizar();
}

// ---- Acessos ------------------------------------------------------------------------------------

async function paginaAcessos() {
  conteudo().innerHTML = carregando();
  const membros = await api.admin.acessos();
  conteudo().innerHTML = `
    ${cabecalho('Acessos', 'Usuários do painel e dos portais da rede. Cadastros de parceiros entram como "aguardando aprovação".')}
    ${tabela(['Usuário', 'Perfil', 'Estabelecimento', 'Status', 'Último acesso', ''], membros.map((m) => `<tr>
      <td class="${cls.td}"><div class="flex items-center gap-3">${avatar(m.usuario.nome)}<div><p class="font-semibold text-slate-900">${esc(m.usuario.nome)}</p><p class="text-xs text-slate-500">${esc(m.usuario.email)}</p></div></div></td>
      <td class="${cls.td}">${m.papeis.map((p) => esc(p.nome)).join(', ')}</td>
      <td class="${cls.td}">${m.papeis.map((p) => (p.estabelecimento ? `${esc(p.estabelecimento.nome)} ${p.estabelecimento.status !== 'ATIVO' ? badge(p.estabelecimento.status) : ''}` : '<span class="text-slate-400">Hospital</span>')).join('<br>')}</td>
      <td class="${cls.td}">${badge(m.status)}</td>
      <td class="${cls.td} text-xs text-slate-500">${m.usuario.ultimoAcessoEm ? fmt.dataHora(m.usuario.ultimoAcessoEm) : 'Nunca'}</td>
      <td class="${cls.td} text-right whitespace-nowrap">${m.status === 'PENDENTE_APROVACAO' ? `<button data-status="ATIVO" data-id="${m.id}" class="${btn('primario', 'py-1 text-xs')}">Aprovar</button>` : ''}${m.status === 'ATIVO' && m.usuarioId !== api.sessao().usuarioId ? `<button data-status="BLOQUEADO" data-id="${m.id}" class="${btn('fantasma', 'py-1 text-xs text-red-600')}">Bloquear</button>` : ''}${m.status === 'BLOQUEADO' ? `<button data-status="ATIVO" data-id="${m.id}" class="${btn('secundario', 'py-1 text-xs')}">Reativar</button>` : ''}</td>
    </tr>`))}`;
  conteudo().querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', () =>
      comCarregando(b, async () => {
        try {
          await api.admin.alterarStatusAcesso(b.dataset.id, b.dataset.status);
          toast('Acesso atualizado.');
          paginaAcessos();
        } catch (e) {
          tratarErro(e);
        }
      }),
    ),
  );
}

// ---- Auditoria ------------------------------------------------------------------------------------

async function paginaAuditoria() {
  conteudo().innerHTML = carregando();
  const logs = await api.admin.auditoria();
  conteudo().innerHTML = `
    ${cabecalho('Trilha de auditoria', 'Registro imutável (append-only) com encadeamento de hash SHA-256 por tenant', `<button id="verificar" class="${btn()}">${icone('escudo', 'size-4')} Verificar integridade</button>`)}
    <div id="resultado"></div>
    ${tabela(['#', 'Data', 'Ator', 'Ação', 'Entidade', 'Detalhes', 'Hash'], logs.map((l) => `<tr>
      <td class="${cls.td} text-xs text-slate-400">${l.id}</td>
      <td class="${cls.td} whitespace-nowrap text-xs">${fmt.dataHora(l.criadoEm)}</td>
      <td class="${cls.td} text-xs">${esc(l.usuarioNome ?? l.atorTipo)}<p class="text-slate-400">${esc(l.portal ?? '')}</p></td>
      <td class="${cls.td}"><span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">${esc(l.acao)}</span></td>
      <td class="${cls.td} text-xs">${esc(l.entidade)}</td>
      <td class="${cls.td} max-w-xs truncate font-mono text-[11px] text-slate-500" title="${esc(JSON.stringify(l.dadosDepois ?? {}))}">${esc(JSON.stringify(l.dadosDepois ?? {}))}</td>
      <td class="${cls.td} font-mono text-[11px] text-slate-400">${esc(l.hash.slice(0, 10))}…</td></tr>`), { vazioTexto: 'Sem registros.' })}`;
  conteudo().querySelector('#verificar').addEventListener('click', (e) =>
    comCarregando(e.currentTarget, async () => {
      const r = await api.admin.verificarAuditoria();
      conteudo().querySelector('#resultado').innerHTML = r.ok
        ? `<div class="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">${icone('check', 'inline size-4')} Cadeia íntegra: ${r.total} registros verificados, nenhum adulterado.</div>`
        : `<div class="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">${icone('alerta', 'inline size-4')} Cadeia quebrada no registro #${r.quebradoEm} — houve adulteração.</div>`;
    }),
  );
}

await garantirBanco();
document.body.classList.add('pronto');
iniciar();
