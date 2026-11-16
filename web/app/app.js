// =============================================================================
// APP DO BENEFICIÁRIO (PWA mobile) — carteirinha com QR dinâmico offline,
// rede credenciada, agendamento, faturas (Pix/boleto simulados) e economia.
// =============================================================================

import { aoMudarDados, criarApi, garantirBanco, sugestoesPrimeiroAcesso } from '../assets/js/backend/api.js';
import { PASSO_TOTP, totp } from '../assets/js/lib/crypto.js';
import { qrSvg } from '../assets/js/lib/pagamentos-fake.js';
import { debounce, esc, fmt, idade } from '../assets/js/lib/util.js';
import { abrirCobranca } from '../assets/js/ui/cobranca.js';
import { renderizarLogin, tenantSelecionado } from '../assets/js/ui/login.js';
import {
  ICONE_CATEGORIA, ROTULO_CATEGORIA, ROTULO_PARENTESCO, ROTULO_TIPO_ESTAB, aplicarBranding, avatar, badge, btn, campo, carregando, cls,
  comCarregando, confirmar, copiar, dadosForm, estrelas, icone, modal, opcoes, roteador, toast, tratarErro, vazio,
} from '../assets/js/ui/ui.js';

const api = criarApi('app');
const raiz = document.getElementById('app');
let rotaAtual = null;
let pararRoteador = () => {};
let pararTimers = () => {};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

const moldura = (html) => `<div class="mx-auto flex min-h-screen max-w-md flex-col bg-[var(--superficie)] shadow-xl">${html}</div>`;

function iniciar() {
  if (!api.sessao()) return location.hash === '#/primeiro-acesso' ? telaPrimeiroAcesso() : telaLogin();
  aplicarBranding(api.branding());
  montarShell();
  pararRoteador = roteador(ROTAS, (r) => {
    rotaAtual = r;
    renderizarRota();
  });
}

// ---- Login / primeiro acesso -----------------------------------------------------------------

function telaLogin() {
  renderizarLogin(raiz, {
    portal: 'app',
    titulo: 'Olá! Que bom ter você aqui',
    subtitulo: 'Entre para acessar seu clube de benefícios',
    icone: 'coracao',
    rodape: `<div class="mt-4 rounded-xl bg-white p-4 text-center text-sm ring-1 ring-slate-200">Já é associado e ainda não tem senha?<br><a href="#/primeiro-acesso" id="ir-primeiro" class="font-semibold text-marca hover:underline">Fazer primeiro acesso</a></div>`,
    entrar: async (dados) => {
      await api.auth.login(dados);
      location.hash = '#/';
      iniciar();
    },
  });
  raiz.querySelector('#ir-primeiro').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '#/primeiro-acesso';
    telaPrimeiroAcesso();
  });
}

function telaPrimeiroAcesso() {
  const slug = tenantSelecionado();
  const sugestoes = sugestoesPrimeiroAcesso(slug);
  raiz.innerHTML = moldura(`
    <div class="flex-1 px-5 py-8">
      <a href="#" id="voltar" class="inline-flex items-center gap-1 text-sm text-slate-500">${icone('voltar', 'size-4')} Voltar</a>
      <h1 class="mt-4 text-2xl font-extrabold">Primeiro acesso</h1>
      <p class="mt-1 text-sm text-slate-600">Confirme seus dados do contrato e crie sua senha.</p>
      <form class="mt-6 space-y-4" novalidate>
        ${campo('CPF do associado', `<input name="cpf" inputmode="numeric" required class="${cls.input}" placeholder="000.000.000-00">`)}
        ${campo('Data de nascimento', `<input name="dataNascimento" type="date" required class="${cls.input}">`)}
        ${campo('E-mail', `<input name="email" type="email" required class="${cls.input}" placeholder="voce@email.teste">`)}
        ${campo('Crie uma senha', `<input name="senha" type="password" minlength="6" required class="${cls.input}">`, 'Mínimo de 6 caracteres')}
        <label class="flex items-start gap-2 text-xs text-slate-600"><input name="aceite" type="checkbox" class="mt-0.5 size-4"> Li e aceito os termos de uso e a política de privacidade, inclusive o tratamento de dados de saúde para prestação dos benefícios.</label>
        <p data-erro class="hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"></p>
        <button class="${btn('primario', 'w-full py-3')}">Criar acesso</button>
      </form>
      ${sugestoes.length ? `<div class="mt-6 rounded-xl bg-amber-50 p-4 text-xs text-amber-900 ring-1 ring-amber-200"><p class="font-semibold">Dica do simulador — titulares fictícios sem acesso:</p>
        <ul class="mt-2 space-y-1">${sugestoes.map((s) => `<li><button type="button" data-sug='${esc(JSON.stringify(s))}' class="text-left underline cursor-pointer">${esc(s.nome)}</button> · ${fmt.cpf(s.cpf)} · ${fmt.data(s.dataNascimento)}</li>`).join('')}</ul></div>` : ''}
    </div>`);
  raiz.querySelector('#voltar').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '';
    telaLogin();
  });
  const form = raiz.querySelector('form');
  raiz.querySelectorAll('[data-sug]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = JSON.parse(b.dataset.sug);
      form.cpf.value = fmt.cpf(s.cpf);
      form.dataNascimento.value = s.dataNascimento;
      form.email.value = `${s.nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.teste${Math.floor(Math.random() * 900 + 100)}@email.teste`;
      form.senha.value = '123456';
    }),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = dadosForm(form);
    const erro = form.querySelector('[data-erro]');
    erro.classList.add('hidden');
    if (!d.aceite) {
      erro.textContent = 'É necessário aceitar os termos.';
      return erro.classList.remove('hidden');
    }
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        await api.auth.primeiroAcesso({ tenantSlug: slug, ...d });
        location.hash = '#/';
        iniciar();
        toast('Acesso criado. Bem-vindo(a)!');
      } catch (err) {
        if (!err.status) return tratarErro(err);
        erro.textContent = err.message;
        erro.classList.remove('hidden');
      }
    });
  });
}

// ---- Shell -------------------------------------------------------------------------------------

const ABAS = [
  ['#/', 'Início', 'casa'],
  ['#/rede', 'Rede', 'mapa'],
  ['#/carteirinha', 'Carteirinha', 'qr'],
  ['#/faturas', 'Faturas', 'fatura'],
  ['#/perfil', 'Perfil', 'perfil'],
];

function montarShell() {
  const b = api.branding();
  raiz.innerHTML = moldura(`
    <div class="bg-amber-100 px-4 py-1 text-center text-[11px] font-medium text-amber-900">Simulação · dados fictícios</div>
    <header class="sticky top-0 z-20 flex items-center gap-3 bg-[var(--superficie)]/95 px-5 py-3 backdrop-blur">
      <span class="flex size-8 items-center justify-center rounded-lg bg-marca text-white">${icone('coracao', 'size-4')}</span>
      <p class="flex-1 font-bold text-slate-900">${esc(b.nomeApp)}</p>
      <span id="offline" class="hidden rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white">offline</span>
      <button id="emergencia" class="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm cursor-pointer">${icone('sirene', 'size-4')} Emergência</button>
    </header>
    <main id="conteudo" class="flex-1 px-5 pb-28"></main>
    <nav class="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur">
      <ul class="grid grid-cols-5">${ABAS.map(([h, r, i]) =>
        h === '#/carteirinha'
          ? `<li class="flex justify-center"><a href="${h}" data-aba="${h}" class="-mt-7 flex size-14 flex-col items-center justify-center rounded-2xl bg-marca text-white shadow-lg ring-4 ring-white" aria-label="${r}">${icone(i, 'size-6')}</a></li>`
          : `<li><a href="${h}" data-aba="${h}" class="flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold text-slate-400">${icone(i, 'size-5')}${r}</a></li>`,
      ).join('')}</ul>
    </nav>`);
  raiz.querySelector('#emergencia').addEventListener('click', abrirEmergencia);
  const status = () => raiz.querySelector('#offline')?.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', status);
  window.addEventListener('offline', status);
  status();
}

function abrirEmergencia() {
  const b = api.branding();
  modal({
    titulo: 'Precisa de ajuda agora?',
    largura: 'max-w-md',
    corpo: `<div class="space-y-3">
      <a href="tel:${esc(b.telefoneEmergencia)}" class="flex items-center gap-3 rounded-xl bg-red-600 p-4 text-white"><span>${icone('sirene', 'size-6')}</span><span><b class="block text-lg">Ligar ${esc(b.telefoneEmergencia)} (SAMU)</b><span class="text-sm opacity-90">Risco de vida, desmaio, dor no peito, falta de ar</span></span></a>
      <a href="tel:${esc(b.telefoneCentral)}" class="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"><span class="text-marca">${icone('telefone', 'size-6')}</span><span><b class="block">Central do associado</b><span class="text-sm text-slate-500">${fmt.telefone(b.telefoneCentral)}</span></span></a>
      <a href="https://wa.me/55${esc(b.whatsappSuporte)}" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"><span class="text-emerald-600">${icone('telefone', 'size-6')}</span><span><b class="block">WhatsApp</b><span class="text-sm text-slate-500">Dúvidas e agendamentos (número fictício)</span></span></a>
      <p class="text-xs text-slate-500">Pronto-socorro 24h: ${esc(api.tenant().nomeFantasia)} — Matriz. Apresente a carteirinha na recepção.</p>
    </div>`,
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
  pararTimers();
  pararTimers = () => {};
  const anterior = conteudo();
  anterior.replaceWith(anterior.cloneNode(false));
  const base = '#/' + (rotaAtual.rota.split('/').filter(Boolean)[0] ?? '');
  raiz.querySelectorAll('[data-aba]').forEach((a) => {
    if (a.dataset.aba === '#/carteirinha') return;
    a.classList.toggle('text-marca', a.dataset.aba === base);
    a.classList.toggle('text-slate-400', a.dataset.aba !== base);
  });
  window.scrollTo(0, 0);
  try {
    await rotaAtual.fn(rotaAtual.params);
  } catch (e) {
    tratarErro(e);
  }
}

aoMudarDados(debounce(() => api.sessao() && !['/carteirinha', '/agendar'].includes(rotaAtual?.rota) && !document.querySelector('[role=dialog]') && renderizarRota(), 500));

const titulo = (t, sub = '', voltar = '') => `<div class="mb-5 mt-2">${voltar ? `<a href="${voltar}" class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500">${icone('voltar', 'size-4')} Voltar</a>` : ''}<h1 class="text-2xl font-extrabold tracking-tight text-slate-900">${esc(t)}</h1>${sub ? `<p class="text-sm text-slate-500">${esc(sub)}</p>` : ''}</div>`;

const ROTAS = {
  '/': paginaInicio,
  '/carteirinha': paginaCarteirinha,
  '/rede': paginaRede,
  '/rede/:id': paginaEstabelecimento,
  '/agendar': paginaAgendar,
  '/agenda': paginaAgenda,
  '/faturas': paginaFaturas,
  '/historico': paginaHistorico,
  '/dependentes': paginaDependentes,
  '/perfil': paginaPerfil,
};

// ---- Início ------------------------------------------------------------------------------------

async function paginaInicio() {
  conteudo().innerHTML = carregando();
  const d = await api.app.inicio();
  const primeiroNome = d.eu.nome.split(' ')[0];
  const ok = d.elegibilidade.resultado === 'ELEGIVEL';
  const atalhos = [
    ['#/carteirinha', 'Carteirinha', 'qr'], ['#/agendar', 'Agendar', 'calendario'], ['#/rede', 'Rede', 'mapa'],
    ['#/historico', 'Economia', 'dinheiro'], ...(d.ehTitular ? [['#/dependentes', 'Família', 'usuarios'], ['#/faturas', 'Faturas', 'fatura']] : [['#/agenda', 'Agenda', 'relogio'], ['#/perfil', 'Perfil', 'perfil']]),
  ];
  conteudo().innerHTML = `
    <p class="mt-2 text-sm text-slate-500">Que bom ter você de volta,</p>
    <h1 class="text-2xl font-extrabold text-slate-900">${esc(primeiroNome)} 👋</h1>

    <a href="#/carteirinha" class="carteirinha mt-5 block rounded-3xl p-5 text-white shadow-lg">
      <div class="flex items-start justify-between"><div><p class="text-xs font-semibold uppercase tracking-widest opacity-80">Seu plano atual</p><p class="mt-1 text-2xl font-extrabold">${esc(d.plano.nome)}</p></div>
        <span class="rounded-full ${ok ? 'bg-white/20' : 'bg-red-500'} px-2.5 py-1 text-xs font-bold">${ok ? 'Ativo' : esc(d.elegibilidade.resultado === 'EM_CARENCIA' ? 'Em carência' : 'Atenção')}</span></div>
      <p class="mt-4 text-sm opacity-90">${d.visiveis.length} ${d.visiveis.length === 1 ? 'pessoa protegida' : 'pessoas protegidas'} · toque para abrir a carteirinha</p>
    </a>
    ${!ok ? `<div class="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">${esc(d.elegibilidade.motivo)}${d.proximaFatura && d.ehTitular ? ` <a href="#/faturas" class="font-bold underline">Regularizar agora</a>` : ''}</div>` : ''}

    <div class="mt-4 grid grid-cols-2 gap-3">
      <div class="${cls.card} p-4"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Você economizou</p><p class="mt-1 text-xl font-extrabold text-marca">${fmt.moeda(d.economiaMes)}</p><p class="text-xs text-slate-500">neste mês</p></div>
      <div class="${cls.card} p-4"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Desde a adesão</p><p class="mt-1 text-xl font-extrabold text-slate-900">${fmt.moeda(d.economiaTotal)}</p><p class="text-xs text-slate-500">em descontos</p></div>
    </div>

    ${d.proximaFatura ? `
    <div class="mt-3 flex items-center gap-3 rounded-2xl ${d.proximaFatura.status === 'VENCIDA' ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'} p-4 ring-1">
      <span class="text-slate-400">${icone('fatura', 'size-6')}</span>
      <div class="flex-1"><p class="text-sm font-semibold">${d.proximaFatura.status === 'VENCIDA' ? 'Mensalidade vencida' : 'Próxima mensalidade'}</p><p class="text-xs text-slate-500">${fmt.moeda(d.proximaFatura.valorTotal)} · vence ${fmt.data(d.proximaFatura.vencimento)}</p></div>
      <button data-pagar="${d.proximaFatura.id}" class="${btn('primario', 'px-3 py-1.5 text-xs')}">Pagar</button>
    </div>` : ''}

    <div class="mt-5 grid grid-cols-3 gap-3">${atalhos.map(([h, r, i]) => `<a href="${h}" class="flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center text-xs font-semibold text-slate-700 ring-1 ring-slate-200"><span class="flex size-10 items-center justify-center rounded-xl bg-marca-clara text-marca">${icone(i, 'size-5')}</span>${r}</a>`).join('')}</div>

    <div class="mt-6 flex items-center justify-between"><h2 class="font-bold">Próximos agendamentos</h2><a href="#/agenda" class="text-xs font-semibold text-marca">Ver todos</a></div>
    ${d.agendamentos.length ? `<div class="mt-2 space-y-2">${d.agendamentos.slice(0, 3).map(cartaoAgendamento).join('')}</div>` : `<div class="mt-2 rounded-2xl bg-white p-5 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nenhum agendamento. <a href="#/agendar" class="font-semibold text-marca">Agendar agora</a></div>`}

    ${d.notificacoes.length ? `<h2 class="mt-6 font-bold">Avisos</h2><ul class="mt-2 space-y-2">${d.notificacoes.map((n) => `<li class="flex gap-3 rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200"><span class="text-marca">${icone('sino', 'size-5')}</span><div><p>${esc(n.conteudo)}</p><p class="mt-0.5 text-[11px] text-slate-400">${esc(n.canal)} · ${fmt.dataHora(n.enviadaEm ?? n.criadoEm)}</p></div></li>`).join('')}</ul>` : ''}`;
  ligarCancelamento(conteudo());
  conteudo().querySelector('[data-pagar]')?.addEventListener('click', async () => {
    const fats = await api.app.faturas();
    pagarFatura(fats.find((f) => f.id === d.proximaFatura.id));
  });
}

function cartaoAgendamento(a) {
  const d = new Date(a.inicio);
  return `<div class="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
    <div class="flex w-14 shrink-0 flex-col items-center rounded-xl bg-marca-clara py-2 text-marca"><span class="text-lg font-extrabold leading-none">${d.toLocaleDateString('pt-BR', { day: '2-digit' })}</span><span class="text-[11px] font-semibold uppercase">${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div>
    <div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">${esc(a.profissional?.nomeExibicao ?? a.especialidade?.nome ?? 'Atendimento')}</p>
      <p class="truncate text-xs text-slate-500">${fmt.hora(a.inicio)} · ${esc(a.estabelecimento.nome)}</p>
      <p class="truncate text-xs text-slate-500">${esc(a.pessoa.nome.split(' ')[0])} · ${esc(a.especialidade?.nome ?? '')}</p></div>
    <div class="flex flex-col items-end gap-1">${badge(a.status)}${['AGENDADO', 'CONFIRMADO'].includes(a.status) ? `<button data-cancelar="${a.id}" class="text-[11px] font-semibold text-red-600 cursor-pointer">Cancelar</button>` : ''}</div>
  </div>`;
}

function ligarCancelamento(el) {
  el.querySelectorAll('[data-cancelar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar('Deseja cancelar este agendamento? O horário será liberado.', { titulo: 'Cancelar agendamento', perigo: true, textoOk: 'Cancelar agendamento' }))) return;
      try {
        await api.app.cancelarAgendamento(b.dataset.cancelar);
        toast('Agendamento cancelado.');
        renderizarRota();
      } catch (e) {
        tratarErro(e);
      }
    }),
  );
}

// ---- Carteirinha (QR dinâmico TOTP — funciona offline) -------------------------------------------

let carteirinhaSelecionada = 0;

function paginaCarteirinha() {
  const cartoes = api.app.carteirinhas();
  const t = api.tenant();
  carteirinhaSelecionada = Math.min(carteirinhaSelecionada, cartoes.length - 1);
  const c = cartoes[carteirinhaSelecionada];
  const ok = c.elegibilidade.resultado === 'ELEGIVEL';
  conteudo().innerHTML = `
    ${titulo('Sua carteirinha digital', 'Mostre esta tela na recepção ou no balcão')}
    ${cartoes.length > 1 ? `<div class="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">${cartoes.map((x, i) => `<button data-sel="${i}" class="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold cursor-pointer ${i === carteirinhaSelecionada ? 'bg-marca text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}">${esc(x.pessoa.nome.split(' ')[0])}</button>`).join('')}</div>` : ''}

    <div class="carteirinha overflow-hidden rounded-3xl text-white shadow-xl">
      <div class="p-5">
        <div class="flex items-start justify-between gap-3"><div><p class="text-[11px] font-semibold uppercase tracking-widest opacity-80">Clube de benefícios</p><p class="text-lg font-extrabold">${esc(api.branding().nomeApp)}</p></div>
          <span class="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">${esc(c.plano.nome)}</span></div>
        <p class="mt-6 text-[11px] uppercase tracking-widest opacity-70">Identificação do beneficiário</p>
        <p class="text-xl font-bold">${esc(c.pessoa.nome)}</p>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p class="text-[11px] uppercase tracking-widest opacity-70">Nº do beneficiário</p><p class="font-mono font-semibold">${esc(c.numeroCarteirinha)}</p></div>
          <div><p class="text-[11px] uppercase tracking-widest opacity-70">${c.tipo === 'TITULAR' ? 'Titular' : esc(ROTULO_PARENTESCO[c.parentesco] ?? 'Dependente')}</p><p class="font-semibold">${idade(c.pessoa.dataNascimento)} anos · desde ${new Date(c.inicioVigencia).getUTCFullYear()}</p></div></div>
      </div>
      <div class="bg-white p-5 text-slate-900">
        ${ok || c.elegibilidade.resultado === 'EM_CARENCIA' ? `
        <div class="flex items-center gap-4">
          <div id="qr" class="size-36 shrink-0 rounded-xl ring-1 ring-slate-200 [&_svg]:size-full"></div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2"><svg class="size-9 -rotate-90" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" stroke-width="4"/><circle id="anel" class="anel-tempo" cx="18" cy="18" r="15" fill="none" stroke="var(--marca)" stroke-width="4" stroke-linecap="round" stroke-dasharray="94.25" stroke-dashoffset="0"/></svg>
              <div><p class="text-xs text-slate-500">Código renova em</p><p id="segundos" class="font-bold tabular-nums">--s</p></div></div>
            <p class="mt-3 text-xs text-slate-500">Código de validação</p><p id="codigo" class="font-mono text-2xl font-extrabold tracking-[0.2em]">------</p>
          </div>
        </div>
        <button id="copiar-qr" class="${btn('secundario', 'mt-4 w-full text-xs')}">${icone('copiar', 'size-4')} Copiar conteúdo do QR (para testar no portal do parceiro)</button>
        ${c.elegibilidade.resultado === 'EM_CARENCIA' ? `<p class="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">${esc(c.elegibilidade.motivo)}</p>` : ''}`
        : `<div class="flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">${icone('alerta', 'size-5 shrink-0')}<div><p class="font-bold">Carteirinha bloqueada</p><p>${esc(c.elegibilidade.motivo)}</p>${api.app.contexto().ehTitular ? '<a href="#/faturas" class="mt-1 inline-block font-semibold underline">Ver faturas</a>' : ''}</div></div>`}
      </div>
    </div>

    <div class="mt-4 space-y-2 text-sm">
      <div class="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"><span class="text-marca">${icone('escudo', 'size-5')}</span><p class="text-slate-600">O QR muda a cada ${PASSO_TOTP} segundos e <b>funciona sem internet</b>. Print de tela não serve: o código expira.</p></div>
      <button id="carteira" class="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 cursor-pointer"><span class="text-marca">${icone('cartao', 'size-5')}</span><span class="flex-1 font-semibold">Adicionar à carteira do celular</span>${icone('seta', 'size-4 text-slate-400')}</button>
      <p class="pt-2 text-center text-xs text-slate-400">${esc(t.nomeFantasia)} · CNPJ ${fmt.cnpj(t.cnpj)} · Não é plano de saúde.</p>
    </div>`;

  conteudo().querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => ((carteirinhaSelecionada = Number(b.dataset.sel)), renderizarRota())));
  conteudo().querySelector('#carteira').addEventListener('click', () => toast('Simulação: no app nativo (Flutter) o cartão vai para Google Wallet / Apple Wallet.', 'info'));
  if (!conteudo().querySelector('#qr')) return;

  let payload = '';
  const atualizar = async () => {
    const agora = Date.now();
    const codigo = await totp(c.segredoQr, agora);
    const restante = PASSO_TOTP - (Math.floor(agora / 1000) % PASSO_TOTP);
    const novo = `ELO1|${c.numeroCarteirinha}|${codigo}|${c.versaoCarteirinha}`;
    if (!conteudo()?.querySelector('#qr')) return;
    if (novo !== payload) {
      payload = novo;
      conteudo().querySelector('#qr').innerHTML = qrSvg(payload, 4);
      conteudo().querySelector('#codigo').textContent = codigo;
    }
    conteudo().querySelector('#segundos').textContent = `${restante}s`;
    conteudo().querySelector('#anel').style.strokeDashoffset = String(94.25 * (1 - restante / PASSO_TOTP));
  };
  atualizar();
  const timer = setInterval(atualizar, 1000);
  pararTimers = () => clearInterval(timer);
  conteudo().querySelector('#copiar-qr').addEventListener('click', () => copiar(payload));
}

// ---- Rede credenciada --------------------------------------------------------------------------------

const filtrosRede = { categoria: '', busca: '', ordenarPor: 'distancia', lat: null, lon: null };

async function paginaRede() {
  const categorias = ['CONSULTA', 'EXAME_LABORATORIAL', 'EXAME_IMAGEM', 'ODONTOLOGIA', 'FARMACIA', 'TERAPIA', 'VACINA'];
  conteudo().innerHTML = `
    ${titulo('Rede credenciada', 'Hospital, clínicas, laboratórios e farmácias com desconto')}
    <div class="relative"><span class="pointer-events-none absolute left-3 top-3 text-slate-400">${icone('busca', 'size-4')}</span>
      <input id="busca" value="${esc(filtrosRede.busca)}" placeholder="Especialidade, exame, clínica…" class="${cls.input} rounded-xl py-2.5 pl-9"></div>
    <div class="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">${[['', 'Todos'], ...categorias.map((c) => [c, ROTULO_CATEGORIA[c]])].map(([c, r]) => `<button data-cat="${c}" class="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer ${filtrosRede.categoria === c ? 'bg-marca text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}">${r}</button>`).join('')}</div>
    <div class="mt-3 flex items-center justify-between text-xs">
      <div class="flex gap-1 rounded-lg bg-slate-200/70 p-0.5">${[['distancia', 'Mais próximos'], ['avaliacao', 'Melhor avaliados']].map(([k, r]) => `<button data-ord="${k}" class="rounded-md px-2.5 py-1 font-semibold cursor-pointer ${filtrosRede.ordenarPor === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}">${r}</button>`).join('')}</div>
      <button id="gps" class="flex items-center gap-1 font-semibold text-marca cursor-pointer">${icone('mapa', 'size-4')} ${filtrosRede.lat ? 'Usando sua localização' : 'Usar minha localização'}</button>
    </div>
    <div id="lista" class="mt-4">${carregando()}</div>`;
  const el = conteudo();
  const atualizar = async () => {
    const lista = await api.app.rede(filtrosRede);
    el.querySelector('#lista').innerHTML = lista.length
      ? `<p class="mb-2 text-xs text-slate-500">${lista.length} resultado(s) · ${filtrosRede.ordenarPor === 'distancia' ? 'ordenados por distância' : 'ordenados por avaliação'}</p><div class="space-y-3">${lista
          .map((e) => `<a href="#/rede/${e.id}" class="block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div class="flex items-start gap-3"><span class="flex size-11 shrink-0 items-center justify-center rounded-xl ${e.natureza === 'PROPRIO' ? 'bg-marca text-white' : 'bg-marca-clara text-marca'}">${icone(ICONE_CATEGORIA[e.categorias[0]] ?? 'predio', 'size-5')}</span>
              <div class="min-w-0 flex-1"><p class="font-bold text-slate-900">${esc(e.nome)}</p><p class="text-xs text-slate-500">${esc(ROTULO_TIPO_ESTAB[e.tipo])} · ${esc(e.bairro ?? '')}${e.distanciaKm != null ? ` · ${e.distanciaKm.toFixed(1).replace('.', ',')} km` : ''}</p>
                <div class="mt-1 flex items-center gap-2">${e.notaMedia ? `${estrelas(e.notaMedia, 'size-3.5')}<span class="text-xs text-slate-500">${Number(e.notaMedia).toFixed(1)} (${e.totalAvaliacoes})</span>` : '<span class="text-xs text-slate-400">Sem avaliações</span>'}</div></div>
              ${e.natureza === 'PROPRIO' ? '<span class="rounded-full bg-marca-clara px-2 py-0.5 text-[10px] font-bold text-marca">REDE PRÓPRIA</span>' : ''}</div>
            ${e.destaque ? `<p class="mt-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Até ${esc(e.destaque.toLowerCase())}</p>` : ''}
          </a>`)
          .join('')}</div>`
      : vazio('Nada encontrado. Tente outro termo ou limpe os filtros.');
  };
  el.querySelector('#busca').addEventListener('input', debounce((e) => ((filtrosRede.busca = e.target.value), atualizar()), 250));
  el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => ((filtrosRede.categoria = b.dataset.cat), renderizarRota())));
  el.querySelectorAll('[data-ord]').forEach((b) => b.addEventListener('click', () => ((filtrosRede.ordenarPor = b.dataset.ord), renderizarRota())));
  el.querySelector('#gps').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocalização indisponível neste navegador.', 'erro');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        filtrosRede.lat = p.coords.latitude;
        filtrosRede.lon = p.coords.longitude;
        filtrosRede.ordenarPor = 'distancia';
        toast('Distâncias calculadas a partir da sua localização.');
        renderizarRota();
      },
      () => toast('Não foi possível obter sua localização. Usando o endereço do cadastro.', 'info'),
    );
  });
  await atualizar();
}

async function paginaEstabelecimento({ id }) {
  conteudo().innerHTML = carregando();
  const e = await api.app.estabelecimento(id);
  const mapa = e.latitude ? `https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}` : null;
  conteudo().innerHTML = `
    ${titulo(e.nome, `${ROTULO_TIPO_ESTAB[e.tipo]} · ${e.bairro ?? ''}`, '#/rede')}
    <div class="${cls.card} p-4 text-sm">
      <div class="flex items-center gap-2">${e.notaMedia ? `${estrelas(e.notaMedia)}<span class="text-slate-600">${Number(e.notaMedia).toFixed(1)} · ${e.totalAvaliacoes} avaliações</span>` : '<span class="text-slate-400">Ainda sem avaliações</span>'}</div>
      <p class="mt-2 text-slate-600">${esc([e.logradouro, e.numero, e.bairro, e.cidade].filter(Boolean).join(', '))}</p>
      <p class="text-slate-600">${esc(e.horarioFuncionamento ?? '')}</p>
      <div class="mt-3 flex gap-2">${e.telefone ? `<a href="tel:${esc(e.telefone)}" class="${btn('secundario', 'flex-1 text-xs')}">${icone('telefone', 'size-4')} Ligar</a>` : ''}${mapa ? `<a href="${mapa}" target="_blank" rel="noopener" class="${btn('secundario', 'flex-1 text-xs')}">${icone('mapa', 'size-4')} Como chegar</a>` : ''}</div>
    </div>

    ${e.profissionais.length ? `<h2 class="mb-2 mt-6 font-bold">Profissionais</h2><div class="space-y-2">${e.profissionais.map((p) => `
      <div class="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">${avatar(p.nome, 'size-11')}
        <div class="min-w-0 flex-1"><p class="font-semibold">${esc(p.nomeExibicao)}</p><p class="text-xs text-slate-500">${esc(p.especialidades.join(', '))} · ${esc(p.conselho)} ${esc(p.numeroConselho)}/${esc(p.ufConselho)}</p>${p.notaMedia ? `<div class="mt-0.5">${estrelas(p.notaMedia, 'size-3')}</div>` : ''}</div>
        ${e.aceitaAgendamentoOnline || e.natureza === 'PROPRIO' ? `<a href="#/agendar?profissional=${p.id}&estabelecimento=${e.id}" class="${btn('primario', 'px-3 py-1.5 text-xs')}">Agendar</a>` : ''}
      </div>`).join('')}</div>` : ''}

    <h2 class="mb-2 mt-6 font-bold">Serviços e preços para você</h2>
    <div class="${cls.card} divide-y divide-slate-100">${e.ofertas.map((o) => `
      <div class="flex items-center gap-3 px-4 py-3">
        <span class="text-slate-400">${icone(ICONE_CATEGORIA[o.item.categoria], 'size-5')}</span>
        <div class="min-w-0 flex-1"><p class="text-sm font-semibold">${esc(o.item.nome)}</p><p class="text-xs ${o.simulacao.permitido ? 'text-emerald-700' : 'text-slate-400'}">${esc(o.simulacao.motivo)}</p></div>
        ${o.item.categoria === 'FARMACIA' ? '' : `<div class="text-right">${o.simulacao.permitido && o.simulacao.valorDesconto > 0 ? `<p class="text-xs text-slate-400 line-through">${fmt.moeda(o.simulacao.valorOriginal)}</p>` : ''}<p class="font-bold">${o.simulacao.valorPago === 0 && o.simulacao.permitido ? 'Grátis' : fmt.moeda(o.simulacao.valorPago)}</p></div>`}
      </div>`).join('')}</div>
    <p class="mt-2 text-xs text-slate-500">Valores para o titular. Economia calculada pela diferença entre o preço particular e o valor pago.</p>

    ${e.avaliacoes.length ? `<h2 class="mb-2 mt-6 font-bold">O que dizem os associados</h2><div class="space-y-2">${e.avaliacoes.filter((a) => a.comentario).slice(0, 5).map((a) => `<div class="rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200"><div class="flex items-center justify-between">${estrelas(a.nota, 'size-3.5')}<span class="text-xs text-slate-400">${esc(a.autor)} · ${fmt.data(a.criadoEm)}</span></div><p class="mt-1 text-slate-700">${esc(a.comentario)}</p></div>`).join('')}</div>` : ''}`;
}

// ---- Agendamento -----------------------------------------------------------------------------------------

async function paginaAgendar(params) {
  const ctx = api.app.contexto();
  const rede = await api.app.rede({});
  const opcoesProf = rede.flatMap((e) => (e.aceitaAgendamentoOnline || e.natureza === 'PROPRIO' ? e.profissionais.map((p) => ({ p, e })) : []));
  const especialidades = [...new Set(opcoesProf.flatMap((o) => o.p.especialidades))].sort();
  let esp = params.profissional ? opcoesProf.find((o) => o.p.id === params.profissional)?.p.especialidades[0] : '';
  let escolha = params.profissional ? opcoesProf.find((o) => o.p.id === params.profissional && o.e.id === params.estabelecimento) : null;
  let beneficiarioId = ctx.meuBenef.id;
  let slot = null;

  const desenhar = () => {
    const filtrados = opcoesProf.filter((o) => !esp || o.p.especialidades.includes(esp));
    const dias = escolha ? api.app.horarios({ profissionalId: escolha.p.id, estabelecimentoId: escolha.e.id }) : [];
    conteudo().innerHTML = `
      ${titulo('Agendar consulta', 'Escolha a especialidade, o profissional e o horário', '#/')}
      <div class="space-y-5">
        ${ctx.visiveis.length > 1 ? `<div><p class="${cls.label}">Para quem?</p><div class="flex flex-wrap gap-2">${ctx.visiveis.map((b) => `<button data-benef="${b.id}" class="rounded-full px-3 py-1.5 text-sm font-semibold cursor-pointer ${b.id === beneficiarioId ? 'bg-marca text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}">${esc(api.app.carteirinhas().find((c) => c.id === b.id).pessoa.nome.split(' ')[0])}</button>`).join('')}</div></div>` : ''}
        <div>${campo('Especialidade', `<select id="esp" class="${cls.input}">${opcoes([['', 'Todas as especialidades'], ...especialidades.map((e) => [e, e])], esp)}</select>`)}</div>
        <div><p class="${cls.label}">Profissional e local</p><div class="space-y-2">${filtrados.map((o) => `
          <button data-prof="${o.p.id}" data-est="${o.e.id}" class="flex w-full items-center gap-3 rounded-2xl p-3 text-left cursor-pointer ${escolha?.p.id === o.p.id && escolha?.e.id === o.e.id ? 'bg-marca-clara ring-2 ring-marca' : 'bg-white ring-1 ring-slate-200'}">
            ${avatar(o.p.nome)}<span class="min-w-0 flex-1"><span class="block font-semibold">${esc(o.p.nomeExibicao)}</span><span class="block truncate text-xs text-slate-500">${esc(o.p.especialidades.join(', '))} · ${esc(o.e.nome)}${o.e.distanciaKm != null ? ` · ${o.e.distanciaKm.toFixed(1).replace('.', ',')} km` : ''}</span></span>
          </button>`).join('') || vazio('Nenhum profissional com agenda online nesta especialidade.')}</div></div>
        ${escolha ? `<div><p class="${cls.label}">Horários disponíveis</p>${dias.length ? `<div class="space-y-3">${dias.slice(0, 6).map((d) => `
          <div><p class="mb-1.5 text-sm font-semibold capitalize text-slate-700">${new Date(`${d.dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
            <div class="flex flex-wrap gap-2">${d.slots.map((s) => `<button data-slot="${s.inicio}" class="rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums cursor-pointer ${slot === s.inicio ? 'bg-marca text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}">${fmt.hora(s.inicio)}</button>`).join('')}</div></div>`).join('')}</div>` : vazio('Sem horários livres nos próximos dias.', 'calendario')}</div>` : ''}
      </div>
      ${slot ? `<div class="fixed inset-x-0 bottom-20 z-20 mx-auto max-w-md px-5"><button id="confirmar" class="${btn('primario', 'w-full py-3 shadow-lg')}">Confirmar ${fmt.dataHora(slot)}</button></div>` : ''}`;

    const el = conteudo();
    el.querySelector('#esp').addEventListener('change', (e) => ((esp = e.target.value), (escolha = null), (slot = null), desenhar()));
    el.querySelectorAll('[data-benef]').forEach((b) => b.addEventListener('click', () => ((beneficiarioId = b.dataset.benef), desenhar())));
    el.querySelectorAll('[data-prof]').forEach((b) => b.addEventListener('click', () => ((escolha = opcoesProf.find((o) => o.p.id === b.dataset.prof && o.e.id === b.dataset.est)), (slot = null), desenhar())));
    el.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => ((slot = b.dataset.slot), desenhar())));
    el.querySelector('#confirmar')?.addEventListener('click', (ev) =>
      comCarregando(ev.currentTarget, async () => {
        try {
          await api.app.agendar({ beneficiarioId, profissionalId: escolha.p.id, estabelecimentoId: escolha.e.id, inicio: slot });
          toast('Agendado! Você receberá a confirmação pelo WhatsApp (simulado).');
          location.hash = '#/agenda';
        } catch (err) {
          tratarErro(err);
          slot = null;
          desenhar();
        }
      }),
    );
  };
  desenhar();
}

async function paginaAgenda() {
  const d = await api.app.inicio();
  conteudo().innerHTML = `${titulo('Meus agendamentos', '', '#/')}
    ${d.agendamentos.length ? `<div class="space-y-2">${d.agendamentos.map(cartaoAgendamento).join('')}</div>` : vazio('Você não tem agendamentos futuros.', 'calendario')}
    <a href="#/agendar" class="${btn('primario', 'mt-5 w-full py-3')}">${icone('mais', 'size-4')} Novo agendamento</a>`;
  ligarCancelamento(conteudo());
}

// ---- Faturas -----------------------------------------------------------------------------------------------

function pagarFatura(fatura) {
  abrirCobranca({ fatura, emitir: api.app.emitirCobranca.bind(api.app), pagar: api.app.simularPagamento.bind(api.app), aoPagar: renderizarRota });
}

async function paginaFaturas() {
  const ctx = api.app.contexto();
  if (!ctx.ehTitular) {
    conteudo().innerHTML = `${titulo('Faturas')}${vazio('As faturas ficam disponíveis apenas para o titular do contrato.', 'fatura')}`;
    return;
  }
  const fats = await api.app.faturas();
  const abertas = fats.filter((f) => ['ABERTA', 'VENCIDA'].includes(f.status));
  conteudo().innerHTML = `
    ${titulo('Faturas', `${ctx.plano.nome} · ${fmt.moeda(ctx.assinatura.valorMensalidade)}/mês · vence todo dia ${ctx.assinatura.diaVencimento}`)}
    ${abertas.length ? `<h2 class="mb-2 text-sm font-bold text-slate-700">Em aberto</h2><div class="space-y-2">${abertas.map((f) => `
      <div class="rounded-2xl ${f.status === 'VENCIDA' ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'} p-4 ring-1">
        <div class="flex items-start justify-between"><div><p class="text-sm font-semibold capitalize">Mensalidade ${f.competencia ? fmt.mes(f.competencia) : ''}</p><p class="text-xs text-slate-500">Vence ${fmt.data(f.vencimento)} · ${esc(f.numero)}</p></div>${badge(f.status)}</div>
        <div class="mt-3 flex items-center justify-between"><p class="text-xl font-extrabold">${fmt.moeda(f.valorTotal)}</p><button data-pagar="${f.id}" class="${btn('primario', 'px-4 py-2')}">${icone('qr', 'size-4')} Pagar</button></div>
        ${f.status === 'VENCIDA' ? '<p class="mt-2 text-xs text-red-700">Multa de 2% e juros de 1% ao mês são somados ao gerar o código.</p>' : ''}
      </div>`).join('')}</div>` : `<div class="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">${icone('check', 'size-5')} Tudo em dia! Nenhuma fatura em aberto.</div>`}
    <h2 class="mb-2 mt-6 text-sm font-bold text-slate-700">Histórico</h2>
    <div class="${cls.card} divide-y divide-slate-100">${fats.filter((f) => !['ABERTA', 'VENCIDA'].includes(f.status)).slice(0, 18).map((f) => `
      <div class="flex items-center gap-3 px-4 py-3 text-sm"><div class="flex-1"><p class="font-medium capitalize">${f.competencia ? fmt.mes(f.competencia) : esc(f.tipo)}</p><p class="text-xs text-slate-500">${f.pagaEm ? `Pago em ${fmt.data(f.pagaEm)} · ${{ PIX: 'Pix', BOLETO: 'Boleto', CARTAO_CREDITO: 'Cartão' }[f.metodoPagamento] ?? ''}` : esc(f.numero)}</p></div><p class="font-semibold">${fmt.moeda(f.valorPago ?? f.valorTotal)}</p>${badge(f.status)}</div>`).join('') || vazio('Sem histórico.')}</div>`;
  conteudo().querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => pagarFatura(fats.find((f) => f.id === b.dataset.pagar))));
}

// ---- Histórico de uso e avaliações -----------------------------------------------------------------------------

async function paginaHistorico() {
  const lista = await api.app.historico();
  const validos = lista.filter((t) => t.status === 'CONFIRMADA');
  const total = validos.reduce((s, t) => s + Number(t.valorDesconto), 0);
  conteudo().innerHTML = `
    ${titulo('Sua economia', 'Cada uso do clube e quanto você deixou de pagar', '#/')}
    <div class="carteirinha rounded-3xl p-5 text-white"><p class="text-xs font-semibold uppercase tracking-widest opacity-80">Total economizado</p><p class="mt-1 text-3xl font-extrabold">${fmt.moeda(total)}</p><p class="text-sm opacity-90">${validos.length} usos de benefício</p></div>
    <div class="mt-5 space-y-2">${lista.map((t) => `
      <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200 ${t.status !== 'CONFIRMADA' ? 'opacity-60' : ''}">
        <div class="flex items-start gap-3"><span class="mt-0.5 text-marca">${icone(ICONE_CATEGORIA[t.categoria], 'size-5')}</span>
          <div class="min-w-0 flex-1"><p class="font-semibold">${esc(t.descricaoItem)}</p><p class="text-xs text-slate-500">${esc(t.estabelecimento.nome)} · ${esc(t.pessoa.nome.split(' ')[0])} · ${fmt.data(t.ocorridaEm)}</p></div>
          <div class="text-right"><p class="text-xs text-slate-400 line-through">${fmt.moeda(t.valorOriginal)}</p><p class="font-bold">${fmt.moeda(t.valorPagoBeneficiario)}</p></div></div>
        <div class="mt-2 flex items-center justify-between text-xs">${t.status === 'CONFIRMADA' ? `<span class="font-semibold text-emerald-700">Você economizou ${fmt.moeda(t.valorDesconto)}</span>` : badge(t.status)}
          ${t.avaliacao ? `<span class="flex items-center gap-1 text-slate-500">${estrelas(t.avaliacao.nota, 'size-3')}</span>` : t.status === 'CONFIRMADA' && t.categoria !== 'FARMACIA' ? `<button data-avaliar="${t.id}" class="font-semibold text-marca cursor-pointer">Avaliar atendimento</button>` : ''}</div>
      </div>`).join('') || vazio('Você ainda não usou benefícios.', 'dinheiro')}</div>`;
  conteudo().querySelectorAll('[data-avaliar]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = lista.find((x) => x.id === b.dataset.avaliar);
      let nota = 0;
      const m = modal({
        titulo: 'Como foi o atendimento?',
        largura: 'max-w-md',
        corpo: `<p class="text-sm text-slate-600">${esc(t.descricaoItem)} em <b>${esc(t.estabelecimento.nome)}</b>${t.profissional ? ` com ${esc(t.profissional.nomeExibicao)}` : ''}.</p>
          <div class="my-5 flex justify-center gap-2" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-nota="${n}" role="radio" aria-label="${n} estrela(s)" class="text-slate-200 cursor-pointer">${icone('estrela', 'size-10 fill-current')}</button>`).join('')}</div>
          <textarea name="comentario" rows="3" class="${cls.input}" placeholder="Conte como foi (opcional)"></textarea>
          <button data-enviar class="${btn('primario', 'mt-4 w-full')}" disabled>Enviar avaliação</button>`,
      });
      const pintar = () => m.el.querySelectorAll('[data-nota]').forEach((s) => s.classList.toggle('text-amber-400', Number(s.dataset.nota) <= nota));
      m.el.querySelectorAll('[data-nota]').forEach((s) => s.addEventListener('click', () => ((nota = Number(s.dataset.nota)), pintar(), (m.el.querySelector('[data-enviar]').disabled = false))));
      m.el.querySelector('[data-enviar]').addEventListener('click', async () => {
        try {
          await api.app.avaliar({ transacaoId: t.id, nota, comentario: m.el.querySelector('[name=comentario]').value });
          m.fechar();
          toast('Obrigado pela avaliação!');
          renderizarRota();
        } catch (e) {
          tratarErro(e);
        }
      });
    }),
  );
}

// ---- Dependentes -------------------------------------------------------------------------------------------------

function paginaDependentes() {
  const ctx = api.app.contexto();
  const cartoes = api.app.carteirinhas();
  const deps = cartoes.filter((c) => c.tipo === 'DEPENDENTE');
  const podeIncluir = ctx.ehTitular && deps.length < (ctx.plano.maxDependentes ?? 0);
  conteudo().innerHTML = `
    ${titulo('Sua família', `${ctx.plano.nome}: ${ctx.plano.dependentesInclusos} dependente(s) incluso(s), até ${ctx.plano.maxDependentes}`, '#/')}
    <div class="space-y-2">${cartoes.map((c) => `
      <div class="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">${avatar(c.pessoa.nome, 'size-11')}
        <div class="min-w-0 flex-1"><p class="font-semibold">${esc(c.pessoa.nome)}</p><p class="text-xs text-slate-500">${c.tipo === 'TITULAR' ? 'Titular' : esc(ROTULO_PARENTESCO[c.parentesco] ?? '')} · ${idade(c.pessoa.dataNascimento)} anos · <span class="font-mono">${esc(c.numeroCarteirinha)}</span></p></div>${badge(c.elegibilidade.resultado)}</div>`).join('')}</div>
    ${podeIncluir ? `
    <form class="${cls.card} mt-6 space-y-3 p-4" novalidate>
      <h2 class="font-bold">Incluir dependente</h2>
      ${campo('Nome completo', `<input name="nome" required class="${cls.input}">`)}
      <div class="grid grid-cols-2 gap-3">${campo('Parentesco', `<select name="parentesco" class="${cls.input}">${opcoes(Object.entries(ROTULO_PARENTESCO), 'FILHO')}</select>`)}${campo('Nascimento', `<input name="dataNascimento" type="date" required class="${cls.input}">`)}</div>
      ${campo('CPF (opcional para menores)', `<input name="cpf" inputmode="numeric" class="${cls.input}">`)}
      <p class="text-xs text-slate-500">${deps.length >= ctx.plano.dependentesInclusos ? `Este dependente terá custo adicional de ${fmt.moeda(ctx.plano.valorDependenteAdicional)}/mês.` : 'Incluso no seu plano, sem custo adicional.'}</p>
      <button class="${btn('primario', 'w-full')}">Incluir</button>
    </form>` : ctx.ehTitular ? '<p class="mt-6 text-center text-sm text-slate-500">Limite de dependentes do plano atingido.</p>' : ''}`;
  const form = conteudo().querySelector('form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    comCarregando(form.querySelector('button'), async () => {
      try {
        await api.app.adicionarDependente(dadosForm(form));
        toast('Dependente incluído! A carteirinha já está disponível.');
        renderizarRota();
      } catch (err) {
        tratarErro(err);
      }
    });
  });
}

// ---- Perfil --------------------------------------------------------------------------------------------------------

function paginaPerfil() {
  const ctx = api.app.contexto();
  const cons = api.app.consentimentos();
  const ativo = (f) => cons.find((c) => c.finalidade === f)?.concedido ?? false;
  const toggles = [['COMUNICACAO_WHATSAPP', 'Lembretes pelo WhatsApp', 'Confirmação de consultas e avisos de fatura'], ['NOTIFICACAO_PUSH', 'Notificações no celular', 'Avisos do app'], ['MARKETING', 'Ofertas e novidades', 'Campanhas de saúde e novos parceiros'], ['USO_ASSISTENTE_IA', 'Assistente virtual (IA)', 'Orientação sobre especialidades e laudos']];
  conteudo().innerHTML = `
    ${titulo('Perfil')}
    <div class="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">${avatar(ctx.eu.nome, 'size-14 text-base')}<div><p class="font-bold">${esc(ctx.eu.nome)}</p><p class="text-sm text-slate-500">${fmt.cpfMascarado(ctx.eu.cpf)} · ${esc(ctx.plano.nome)}</p><p class="text-xs text-slate-400">Contrato ${esc(ctx.assinatura.numeroContrato)}</p></div></div>

    <form id="contato" class="${cls.card} mt-4 space-y-3 p-4" novalidate>
      <h2 class="font-bold">Contato</h2>
      ${campo('Celular (WhatsApp)', `<input name="celular" value="${esc(fmt.telefone(ctx.eu.celular) === '—' ? '' : fmt.telefone(ctx.eu.celular))}" class="${cls.input}">`)}
      ${campo('E-mail', `<input name="email" type="email" value="${esc(ctx.eu.email ?? '')}" class="${cls.input}">`)}
      <button class="${btn('secundario', 'w-full')}">Salvar contato</button>
    </form>

    <div class="${cls.card} mt-4 p-4"><h2 class="font-bold">Privacidade e comunicação</h2><p class="text-xs text-slate-500">Você pode mudar quando quiser (LGPD).</p>
      <ul class="mt-3 divide-y divide-slate-100">${toggles.map(([f, r, d]) => `<li class="flex items-center gap-3 py-3"><div class="flex-1"><p class="text-sm font-semibold">${r}</p><p class="text-xs text-slate-500">${d}</p></div>
        <label class="relative inline-flex cursor-pointer items-center"><input type="checkbox" data-consent="${f}" ${ativo(f) ? 'checked' : ''} class="peer sr-only"><span class="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-marca after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"></span></label></li>`).join('')}</ul></div>

    <div class="mt-4 space-y-2">
      ${[['#/historico', 'Histórico e economia', 'dinheiro'], ['#/agenda', 'Meus agendamentos', 'calendario'], ...(ctx.ehTitular ? [['#/dependentes', 'Dependentes', 'usuarios']] : [])].map(([h, r, i]) => `<a href="${h}" class="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"><span class="text-marca">${icone(i, 'size-5')}</span><span class="flex-1 font-semibold">${r}</span>${icone('seta', 'size-4 text-slate-400')}</a>`).join('')}
      <button id="instalar" class="hidden w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 cursor-pointer"><span class="text-marca">${icone('mais', 'size-5')}</span><span class="flex-1 font-semibold">Instalar o app no celular</span></button>
      <button id="sair" class="${btn('secundario', 'mt-2 w-full py-3 text-red-600')}">${icone('sair', 'size-4')} Sair da conta</button>
    </div>`;
  const el = conteudo();
  const fc = el.querySelector('#contato');
  fc.addEventListener('submit', (e) => {
    e.preventDefault();
    comCarregando(fc.querySelector('button'), async () => {
      try {
        await api.app.atualizarPerfil(dadosForm(fc));
        toast('Contato atualizado.');
      } catch (err) {
        tratarErro(err);
      }
    });
  });
  el.querySelectorAll('[data-consent]').forEach((c) =>
    c.addEventListener('change', async () => {
      await api.app.alterarConsentimento(c.dataset.consent, c.checked).catch(tratarErro);
      toast('Preferência salva.');
    }),
  );
  if (eventoInstalacao) {
    const bi = el.querySelector('#instalar');
    bi.classList.replace('hidden', 'flex');
    bi.addEventListener('click', () => eventoInstalacao.prompt());
  }
  el.querySelector('#sair').addEventListener('click', async () => {
    await api.auth.logout();
    pararRoteador();
    rotaAtual = null;
    location.hash = '';
    telaLogin();
  });
}

let eventoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacao = e;
});

await garantirBanco();
document.body.classList.add('pronto');
iniciar();
