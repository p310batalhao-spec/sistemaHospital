// =============================================================================
// PORTAL DA REDE CREDENCIADA (médicos, clínicas, laboratórios, farmácias, odonto)
// =============================================================================

import { aoMudarDados, brandingDoTenant, criarApi, garantirBanco, listarTenants } from '../assets/js/backend/api.js';
import { ROTULO_RESULTADO } from '../assets/js/backend/regras.js';
import { debounce, esc, fmt, uuid } from '../assets/js/lib/util.js';
import { formularioAdesao, ligarFormularioAdesao } from '../assets/js/ui/adesao.js';
import { renderizarLogin, tenantSelecionado } from '../assets/js/ui/login.js';
import {
  ICONE_CATEGORIA, ROTULO_PARENTESCO, ROTULO_TIPO_ESTAB, aplicarBranding, avatar, badge, btn, campo, carregando, cls,
  comCarregando, confirmar, dadosForm, faixaSimulacao, icone, modal, opcoes, roteador, toast, tratarErro, vazio,
} from '../assets/js/ui/ui.js';

const api = criarApi('parceiro');
const raiz = document.getElementById('app');
let rotaAtual = null;
let pararRoteador = () => {};

function iniciar() {
  if (!api.sessao()) return location.hash === '#/credenciamento' ? telaCredenciamento() : telaLogin();
  aplicarBranding(api.branding());
  montarShell();
  pararRoteador = roteador(ROTAS, (r) => {
    rotaAtual = r;
    renderizarRota();
  });
}

// ---- Login e autocadastro ------------------------------------------------------------

function telaLogin() {
  renderizarLogin(raiz, {
    portal: 'parceiro',
    titulo: 'Portal da Rede Credenciada',
    subtitulo: 'Valide associados e registre os descontos concedidos',
    icone: 'predio',
    rodape: `<div class="mt-4 rounded-xl bg-white p-4 text-center text-sm ring-1 ring-slate-200">Sua clínica, farmácia ou consultório ainda não é parceiro?<br><a href="#/credenciamento" id="ir-cadastro" class="font-semibold text-marca hover:underline">Quero me credenciar</a></div>`,
    entrar: async (dados) => {
      await api.auth.login(dados);
      location.hash = '#/';
      iniciar();
    },
  });
  raiz.querySelector('#ir-cadastro').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '#/credenciamento';
    telaCredenciamento();
  });
}

function telaCredenciamento() {
  const tenants = listarTenants();
  const slug = tenantSelecionado();
  const tenant = tenants.find((t) => t.slug === slug) ?? tenants[0];
  aplicarBranding(brandingDoTenant(tenant.id));
  raiz.innerHTML = `
    <div class="min-h-screen bg-gradient-to-b from-marca-clara to-white px-4 py-10">
      <div class="mx-auto max-w-2xl">
        <a href="#" id="voltar" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">${icone('voltar', 'size-4')} Voltar ao login</a>
        <h1 class="mt-4 text-2xl font-extrabold text-slate-900">Solicitar credenciamento</h1>
        <p class="mt-1 text-sm text-slate-600">Preencha os dados do estabelecimento e do responsável. O hospital analisa o pedido e libera seu acesso ao portal.</p>
        <form class="${cls.card} mt-6 space-y-6 p-6" novalidate>
          <div>${campo('Rede / hospital', `<select name="tenantSlug" class="${cls.input}">${opcoes(tenants.map((t) => [t.slug, t.nomeFantasia]), tenant.slug)}</select>`)}</div>
          <fieldset><legend class="mb-3 text-sm font-bold text-slate-900">Estabelecimento</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              ${campo('Nome fantasia', `<input name="nome" required class="${cls.input}">`)}
              ${campo('Tipo', `<select name="tipo" class="${cls.input}">${opcoes(['CLINICA', 'CONSULTORIO', 'LABORATORIO', 'CENTRO_IMAGEM', 'FARMACIA', 'CLINICA_ODONTOLOGICA', 'PROFISSIONAL_AUTONOMO'].map((t) => [t, ROTULO_TIPO_ESTAB[t]]))}</select>`)}
              ${campo('CNPJ (ou CPF do autônomo)', `<input name="documento" required inputmode="numeric" class="${cls.input}" placeholder="00.000.000/0001-00">`)}
              ${campo('Razão social', `<input name="razaoSocial" class="${cls.input}">`)}
              ${campo('Telefone / WhatsApp', `<input name="telefone" inputmode="tel" class="${cls.input}" placeholder="(85) 90000-0000">`)}
              ${campo('E-mail comercial', `<input name="emailEst" type="email" class="${cls.input}">`)}
              ${campo('Endereço', `<input name="logradouro" class="${cls.input}" placeholder="Rua, avenida…">`)}
              <div class="grid grid-cols-2 gap-3">${campo('Número', `<input name="numero" class="${cls.input}">`)}${campo('Bairro', `<input name="bairro" class="${cls.input}">`)}</div>
              ${campo('Horário de funcionamento', `<input name="horario" class="${cls.input}" placeholder="Seg a sex, 8h às 18h">`)}
              ${campo('Serviços / especialidades', `<input name="especialidades" class="${cls.input}" placeholder="Ex.: clínica geral, pediatria">`)}
            </div>
          </fieldset>
          <fieldset><legend class="mb-3 text-sm font-bold text-slate-900">Responsável pelo acesso</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              ${campo('Nome completo', `<input name="respNome" required class="${cls.input}">`)}
              ${campo('E-mail de login', `<input name="respEmail" type="email" required class="${cls.input}" placeholder="voce@clinica.teste">`)}
              ${campo('Senha', `<input name="senha" type="password" required minlength="6" class="${cls.input}">`)}
              ${campo('Confirmar senha', `<input name="senha2" type="password" required class="${cls.input}">`)}
            </div>
          </fieldset>
          <label class="flex items-start gap-2 text-sm text-slate-600"><input name="aceite" type="checkbox" class="mt-0.5 size-4"> Declaro que as informações são verdadeiras e aceito os termos de credenciamento e a política de privacidade (LGPD).</label>
          <p data-erro class="hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"></p>
          <button class="${btn('primario', 'w-full py-2.5')}">Enviar solicitação</button>
        </form>
      </div>
    </div>`;
  raiz.querySelector('#voltar').addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '';
    telaLogin();
  });
  const form = raiz.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = dadosForm(form);
    const erro = form.querySelector('[data-erro]');
    const falhar = (msg) => {
      erro.textContent = msg;
      erro.classList.remove('hidden');
    };
    erro.classList.add('hidden');
    if (d.senha !== d.senha2) return falhar('As senhas não conferem.');
    if (!d.aceite) return falhar('É necessário aceitar os termos.');
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        await api.auth.solicitarCredenciamento({
          tenantSlug: d.tenantSlug,
          estabelecimento: { nome: d.nome, tipo: d.tipo, documento: d.documento, razaoSocial: d.razaoSocial, telefone: d.telefone, email: d.emailEst, logradouro: d.logradouro, numero: d.numero, bairro: d.bairro, horario: d.horario, especialidades: d.especialidades },
          responsavel: { nome: d.respNome, email: d.respEmail, senha: d.senha },
        });
        raiz.innerHTML = `
          <div class="flex min-h-screen items-center justify-center bg-gradient-to-b from-marca-clara to-white px-4">
            <div class="${cls.card} max-w-md p-8 text-center">
              <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">${icone('check', 'size-7')}</span>
              <h1 class="mt-4 text-xl font-bold">Solicitação enviada!</h1>
              <p class="mt-2 text-sm text-slate-600">O cadastro de <b>${esc(d.nome)}</b> está em análise. Você poderá entrar com <b>${esc(d.respEmail)}</b> assim que o hospital aprovar.</p>
              <p class="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Para testar: entre no Painel do Hospital (admin@hospitalvida.teste) → Rede credenciada → filtro "Em análise" → Aprovar.</p>
              <a href="#" id="ok" class="${btn('primario', 'mt-6 w-full')}">Ir para o login</a>
            </div>
          </div>`;
        raiz.querySelector('#ok').addEventListener('click', (ev) => {
          ev.preventDefault();
          location.hash = '';
          telaLogin();
        });
      } catch (err) {
        if (err.status) falhar(err.message);
        else tratarErro(err);
      }
    });
  });
}

// ---- Shell ------------------------------------------------------------------------------

const MENU = [
  ['#/', 'Atender', 'qr', 'parceiro.validar'],
  ['#/agenda', 'Agenda', 'calendario', 'parceiro.agenda'],
  ['#/beneficiarios', 'Beneficiários', 'usuarios', 'parceiro.beneficiarios'],
  ['#/transacoes', 'Transações', 'troca', 'parceiro.transacoes'],
  ['#/repasses', 'Repasses', 'dinheiro', 'parceiro.repasses'],
  ['#/novo-cliente', 'Novo cliente', 'dependente', 'parceiro.preadesao'],
];

function montarShell() {
  const s = api.sessao();
  const e = api.parceiro.meuEstabelecimento();
  raiz.innerHTML = `
    ${faixaSimulacao()}
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span class="flex size-10 items-center justify-center rounded-xl bg-marca text-white">${icone(e.tipo === 'FARMACIA' ? 'pilula' : e.tipo === 'CLINICA_ODONTOLOGICA' ? 'dente' : e.tipo === 'LABORATORIO' ? 'frasco' : 'predio', 'size-5')}</span>
        <div class="min-w-0 flex-1"><p class="truncate font-bold text-slate-900">${esc(e.nome)}</p><p class="truncate text-xs text-slate-500">${esc(ROTULO_TIPO_ESTAB[e.tipo])} · ${esc(api.tenant().nomeFantasia)}</p></div>
        <div class="flex items-center gap-2 text-right"><div class="hidden sm:block"><p class="text-sm font-semibold">${esc(s.nome)}</p><p class="text-xs text-slate-500">${esc(s.email)}</p></div>${avatar(s.nome)}
          <button id="sair" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer" title="Sair">${icone('sair', 'size-4')}</button></div>
      </div>
      <nav class="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 rolagem-fina">${MENU.filter(([, , , p]) => api.pode(p)).map(([h, r, i]) => `<a href="${h}" data-menu="${h}" class="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-900">${icone(i, 'size-4')}${r}</a>`).join('')}</nav>
    </header>
    <main id="conteudo" class="mx-auto max-w-6xl px-4 py-6"></main>`;
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
  const anterior = conteudo();
  anterior.replaceWith(anterior.cloneNode(false));
  const base = '#/' + (rotaAtual.rota.split('/').filter(Boolean)[0] ?? '');
  raiz.querySelectorAll('[data-menu]').forEach((a) => {
    const ativo = a.dataset.menu === base;
    a.classList.toggle('border-marca', ativo);
    a.classList.toggle('text-marca', ativo);
  });
  try {
    await rotaAtual.fn(rotaAtual.params);
  } catch (e) {
    tratarErro(e);
    if (e.status === 403) conteudo().innerHTML = vazio(e.message, 'escudo');
  }
}

aoMudarDados(debounce(() => api.sessao() && rotaAtual?.rota !== '/' && !document.querySelector('[role=dialog]') && renderizarRota(), 400));

const kpi = (rotulo, valor, detalhe = '') => `<div class="${cls.card} p-4"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${esc(rotulo)}</p><p class="mt-1 text-xl font-extrabold text-slate-900">${valor}</p>${detalhe ? `<p class="text-xs text-slate-500">${detalhe}</p>` : ''}</div>`;

const ROTAS = {
  '/': paginaAtender,
  '/agenda': paginaAgenda,
  '/beneficiarios': paginaBeneficiarios,
  '/transacoes': paginaTransacoes,
  '/repasses': paginaRepasses,
  '/novo-cliente': paginaNovoCliente,
};

// ---- Atender: validar elegibilidade e registrar uso ---------------------------------------

let metodoValidacao = 'QR_CODE';

async function paginaAtender(params) {
  if (!api.pode('parceiro.validar')) return (location.hash = '#/transacoes');
  const p = await api.parceiro.painel();
  const metodos = [['QR_CODE', 'QR Code', 'qr'], ['CPF', 'CPF', 'perfil'], ['NUMERO_CARTEIRINHA', 'Nº da carteirinha', 'cartao']];
  if (params.carteirinha) metodoValidacao = 'NUMERO_CARTEIRINHA';
  conteudo().innerHTML = `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      ${kpi('Atendimentos no mês', fmt.numero(p.usosMes))}
      ${kpi('Descontos concedidos', fmt.moeda(p.descontoMes))}
      ${kpi('Faturado com associados', fmt.moeda(p.faturadoMes))}
      ${kpi('Repasse em aberto', fmt.moeda(Math.abs(p.liquidoAberto)), p.liquidoAberto >= 0 ? 'a receber do hospital' : 'taxa a pagar ao hospital')}
      ${kpi('Avaliação', p.avaliacao.nota ? `${Number(p.avaliacao.nota).toFixed(1)} ★` : '—', `${p.avaliacao.total} avaliações`)}
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section class="${cls.card} self-start p-5">
        <h1 class="text-lg font-bold">Validar associado</h1>
        <p class="text-sm text-slate-500">Peça a carteirinha digital no app ou informe o CPF.</p>
        <div class="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">${metodos.map(([m, r, i]) => `<button type="button" data-metodo="${m}" class="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold cursor-pointer ${metodoValidacao === m ? 'bg-white text-marca shadow-sm' : 'text-slate-500 hover:text-slate-800'}">${icone(i, 'size-4')}${r}</button>`).join('')}</div>
        <form id="validar" class="mt-4 space-y-3" novalidate>
          ${metodoValidacao === 'QR_CODE'
            ? `${campo('Código do QR', `<textarea name="valor" rows="2" class="${cls.input} font-mono" placeholder="ELO1|VID000001-00|123456|1"></textarea>`, 'Leitores de QR em modo teclado preenchem este campo. Também é possível colar o código exibido abaixo do QR no app.')}
               ${'BarcodeDetector' in window ? `<button type="button" id="camera" class="${btn('secundario', 'w-full')}">${icone('qr', 'size-4')} Ler com a câmera</button><video id="video" class="hidden w-full rounded-xl bg-black" playsinline muted></video>` : ''}`
            : metodoValidacao === 'CPF'
              ? campo('CPF do associado', `<input name="valor" inputmode="numeric" class="${cls.input}" placeholder="000.000.000-00" autocomplete="off">`, 'Ex. fictício: 529.982.247-25')
              : campo('Número da carteirinha', `<input name="valor" class="${cls.input} font-mono uppercase" placeholder="VID000001-00" value="${esc(params.carteirinha ?? '')}">`)}
          <button class="${btn('primario', 'w-full py-2.5')}">${icone('busca', 'size-4')} Validar</button>
        </form>
        <p class="mt-4 flex gap-2 text-xs text-slate-500">${icone('escudo', 'size-4 shrink-0')} Toda consulta fica registrada na trilha de auditoria do hospital (LGPD).</p>
      </section>
      <section id="resultado">${p.ultimas.length ? `
        <div class="${cls.card} p-5"><h2 class="font-semibold">Últimos atendimentos</h2>
          <ul class="mt-3 divide-y divide-slate-100">${p.ultimas.map((t) => `<li class="flex items-center gap-3 py-2.5 text-sm"><span class="text-slate-400">${icone(ICONE_CATEGORIA[t.categoria], 'size-5')}</span><div class="min-w-0 flex-1"><p class="truncate font-medium">${esc(t.descricaoItem)}</p><p class="truncate text-xs text-slate-500">${esc(t.pessoa.nome)} · ${fmt.dataHora(t.ocorridaEm)}</p></div><span class="text-right text-sm font-semibold ${t.transacaoOriginalId ? 'text-slate-400' : 'text-emerald-700'}">${t.transacaoOriginalId ? 'estorno' : `−${fmt.moeda(t.valorDesconto)}`}</span></li>`).join('')}</ul></div>` : `<div class="${cls.card}">${vazio('Valide um associado para começar.', 'qr')}</div>`}
      </section>
    </div>`;

  const el = conteudo();
  el.querySelectorAll('[data-metodo]').forEach((b) => b.addEventListener('click', () => ((metodoValidacao = b.dataset.metodo), paginaAtender({}))));
  const form = el.querySelector('#validar');
  const validar = () =>
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        const r = await api.parceiro.validar({ metodo: metodoValidacao, valor: form.valor.value });
        mostrarResultado(r, params.agendamento);
      } catch (e) {
        tratarErro(e);
      }
    });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.valor.value.trim()) return toast('Informe o dado para validação.', 'erro');
    validar();
  });
  form.valor?.focus();
  ligarCamera(el, form, validar);
  if (params.carteirinha) validar();
}

function ligarCamera(el, form, validar) {
  const botao = el.querySelector('#camera');
  if (!botao) return;
  botao.addEventListener('click', async () => {
    const video = el.querySelector('#video');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.classList.remove('hidden');
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const parar = () => stream.getTracks().forEach((t) => t.stop());
      const loop = async () => {
        if (!document.body.contains(video)) return parar();
        const [codigo] = await detector.detect(video).catch(() => []);
        if (codigo) {
          parar();
          video.classList.add('hidden');
          form.valor.value = codigo.rawValue;
          return validar();
        }
        setTimeout(loop, 300);
      };
      loop();
    } catch {
      toast('Não foi possível acessar a câmera.', 'erro');
    }
  });
}

function mostrarResultado(r, agendamentoId) {
  const area = conteudo().querySelector('#resultado');
  const ok = r.resultado === 'ELEGIVEL';
  const b = r.beneficiario;
  area.innerHTML = `
    <div class="${cls.card} overflow-hidden">
      <div class="flex items-center gap-4 p-5 ${ok ? 'bg-emerald-50' : r.resultado === 'EM_CARENCIA' ? 'bg-amber-50' : 'bg-red-50'}">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-600' : r.resultado === 'EM_CARENCIA' ? 'bg-amber-500' : 'bg-red-600'} text-white">${icone(ok ? 'check' : 'alerta', 'size-6')}</span>
        <div><p class="text-lg font-extrabold ${ok ? 'text-emerald-800' : r.resultado === 'EM_CARENCIA' ? 'text-amber-900' : 'text-red-800'}">${esc(ROTULO_RESULTADO[r.resultado])}</p><p class="text-sm text-slate-700">${esc(r.motivo)}</p></div>
      </div>
      ${b ? `
      <div class="flex flex-wrap items-center gap-4 border-b border-slate-100 p-5">
        ${avatar(b.nome, 'size-12 text-sm')}
        <div class="min-w-0 flex-1"><p class="text-lg font-bold text-slate-900">${esc(b.nome)}</p>
          <p class="text-sm text-slate-500">${b.tipo === 'TITULAR' ? 'Titular' : `Dependente · ${ROTULO_PARENTESCO[b.parentesco] ?? ''}`} · ${b.idade} anos${b.cpfMascarado ? ` · CPF ${esc(b.cpfMascarado)}` : ''}</p>
          <p class="mt-0.5 font-mono text-xs text-slate-500">${esc(b.numeroCarteirinha)}</p></div>
        <span class="rounded-full px-3 py-1 text-sm font-bold text-white" style="background:${esc(b.corPlano)}">${esc(b.plano)}</span>
      </div>` : ''}
      ${b && r.ofertas?.length ? `
      <div class="p-5">
        <h2 class="text-sm font-semibold text-slate-700">Benefícios neste estabelecimento</h2>
        <ul class="mt-3 divide-y divide-slate-100">${r.ofertas.map((o) => `
          <li class="flex flex-wrap items-center gap-3 py-3 ${o.simulacao.permitido && ok ? '' : 'opacity-60'}">
            <span class="text-slate-400">${icone(ICONE_CATEGORIA[o.item.categoria], 'size-5')}</span>
            <div class="min-w-0 flex-1"><p class="font-medium text-slate-900">${esc(o.item.nome)}</p>
              <p class="text-xs ${o.simulacao.permitido ? 'text-emerald-700' : 'text-slate-500'}">${esc(o.simulacao.motivo)}</p></div>
            ${o.item.categoria === 'FARMACIA' ? '<span class="text-xs text-slate-500">valor da compra</span>' : `<div class="text-right"><p class="text-xs text-slate-400 line-through">${fmt.moeda(o.simulacao.valorOriginal)}</p><p class="font-bold text-slate-900">${fmt.moeda(o.simulacao.valorPago)}</p></div>`}
            ${ok && o.simulacao.permitido && api.pode('parceiro.transacionar') ? `<button data-registrar="${o.item.id}" class="${btn('primario', 'py-1.5 text-xs')}">Registrar</button>` : ''}
          </li>`).join('')}</ul>
      </div>` : ''}
    </div>`;
  area.querySelectorAll('[data-registrar]').forEach((bt) => bt.addEventListener('click', () => abrirRegistro(r, r.ofertas.find((o) => o.item.id === bt.dataset.registrar), agendamentoId)));
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function abrirRegistro(validacao, oferta, agendamentoId) {
  const e = api.parceiro.meuEstabelecimento();
  const farmacia = oferta.item.categoria === 'FARMACIA';
  const profs = ['CONSULTA', 'ODONTOLOGIA', 'TERAPIA'].includes(oferta.item.categoria) ? e.profissionais : [];
  const chave = uuid(); // idempotência: um clique duplo não gera dois lançamentos
  const m = modal({
    titulo: 'Registrar uso do benefício',
    corpo: `<form class="space-y-4" novalidate>
      <div class="rounded-xl bg-slate-50 p-3 text-sm"><p class="font-semibold">${esc(oferta.item.nome)}</p><p class="text-slate-500">${esc(validacao.beneficiario.nome)} · ${esc(validacao.beneficiario.plano)}</p></div>
      ${farmacia ? campo('Valor total da compra (R$)', `<input name="valorInformado" type="number" step="0.01" min="0.01" required class="${cls.input}" placeholder="0,00">`) : campo('Quantidade', `<input name="quantidade" type="number" min="1" value="1" class="${cls.input}">`)}
      ${profs.length ? campo('Profissional', `<select name="profissionalId" class="${cls.input}">${opcoes([['', '—'], ...profs.map((p) => [p.id, p.nomeExibicao])], api.sessao().profissionalId ?? '')}</select>`) : ''}
      <div data-previa class="rounded-xl ring-1 ring-slate-200"></div>
      <div class="flex justify-end gap-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Confirmar e autorizar</button></div>
    </form>`,
  });
  const form = m.el.querySelector('form');
  const previa = m.el.querySelector('[data-previa]');
  const atualizar = async () => {
    const d = dadosForm(form);
    if (farmacia && !(Number(d.valorInformado) > 0)) return (previa.innerHTML = '<p class="p-3 text-sm text-slate-500">Informe o valor para calcular o desconto.</p>');
    const s = await api.parceiro.simular({ beneficiarioId: validacao.beneficiario.id, itemCatalogoId: oferta.item.id, quantidade: d.quantidade, valorInformado: d.valorInformado });
    previa.innerHTML = s.permitido
      ? `<dl class="divide-y divide-slate-100 text-sm">${[['Valor de tabela', fmt.moeda(s.valorOriginal)], ['Benefício aplicado', esc(s.motivo)], ['Desconto concedido', `<span class="text-emerald-700">−${fmt.moeda(s.valorDesconto)}</span>`], ['Associado paga', `<b class="text-lg">${fmt.moeda(s.valorPago)}</b>`]].map(([k, v]) => `<div class="flex justify-between gap-4 px-3 py-2"><dt class="text-slate-500">${k}</dt><dd class="text-right">${v}</dd></div>`).join('')}</dl>`
      : `<p class="p-3 text-sm text-red-700">${esc(s.motivo)}</p>`;
  };
  form.addEventListener('input', debounce(atualizar, 200));
  atualizar();
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = dadosForm(form);
    comCarregando(form.querySelector('button:not([type])'), async () => {
      try {
        const t = await api.parceiro.registrarUso({ validacaoId: validacao.validacaoId, beneficiarioId: validacao.beneficiario.id, itemCatalogoId: oferta.item.id, quantidade: d.quantidade, valorInformado: d.valorInformado, profissionalId: d.profissionalId, agendamentoId, chaveIdempotencia: chave });
        m.fechar();
        comprovante(t);
      } catch (err) {
        tratarErro(err);
      }
    });
  });
}

function comprovante(t) {
  const m = modal({
    titulo: 'Uso autorizado',
    largura: 'max-w-sm',
    corpo: `<div id="comprovante" class="text-sm">
      <div class="text-center"><span class="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">${icone('check', 'size-6')}</span>
        <p class="mt-2 text-xs uppercase tracking-wide text-slate-500">Código de autorização</p><p class="font-mono text-xl font-bold">${esc(t.codigoAutorizacao)}</p></div>
      <dl class="mt-4 divide-y divide-dashed divide-slate-200 rounded-xl bg-slate-50 p-3">${[['Data', fmt.dataHora(t.ocorridaEm)], ['Estabelecimento', esc(t.estabelecimento.nome)], ['Associado', esc(t.pessoa.nome)], ['Carteirinha', `<span class="font-mono">${esc(t.beneficiario.numeroCarteirinha)}</span>`], ['Item', esc(t.descricaoItem)], ['Valor de tabela', fmt.moeda(t.valorOriginal)], ['Desconto', `−${fmt.moeda(t.valorDesconto)}`], ['Valor pago', `<b>${fmt.moeda(t.valorPagoBeneficiario)}</b>`]].map(([k, v]) => `<div class="flex justify-between gap-3 py-1.5"><dt class="text-slate-500">${k}</dt><dd class="text-right">${v}</dd></div>`).join('')}</dl>
      <p class="mt-3 text-center text-[11px] text-slate-400">Comprovante simulado — Sistema Elo Saúde</p></div>
      <div class="mt-4 flex gap-2 nao-imprimir"><button type="button" data-imprimir class="${btn('secundario', 'flex-1')}">Imprimir</button><button type="button" data-fechar class="${btn('primario', 'flex-1')}">Concluir</button></div>`,
    aoFechar: () => renderizarRota(),
  });
  m.el.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
  toast('Desconto registrado e enviado ao hospital.');
}

// ---- Agenda ---------------------------------------------------------------------------------

let diaAgenda = new Date().toISOString().slice(0, 10);

async function paginaAgenda() {
  const lista = await api.parceiro.agenda({ dia: diaAgenda });
  const mover = (n) => {
    const d = new Date(`${diaAgenda}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    diaAgenda = d.toISOString().slice(0, 10);
    renderizarRota();
  };
  const proximos = { AGENDADO: [['CONFIRMADO', 'Confirmar'], ['CHECKIN', 'Check-in'], ['FALTOU', 'Faltou'], ['CANCELADO', 'Cancelar']], CONFIRMADO: [['CHECKIN', 'Check-in'], ['FALTOU', 'Faltou'], ['CANCELADO', 'Cancelar']], CHECKIN: [['ATENDIDO', 'Finalizar']] };
  conteudo().innerHTML = `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-extrabold">Agenda</h1>
      <div class="flex items-center gap-2"><button id="ant" class="${btn('secundario', 'px-2')}" aria-label="Dia anterior">${icone('voltar', 'size-4')}</button><input id="dia" type="date" value="${diaAgenda}" class="${cls.input} w-auto"><button id="prox" class="${btn('secundario', 'px-2')}" aria-label="Próximo dia">${icone('seta', 'size-4')}</button><button id="hoje" class="${btn('fantasma')}">Hoje</button></div>
    </div>
    <p class="mb-3 text-sm capitalize text-slate-500">${new Date(`${diaAgenda}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${lista.length} agendamento(s)</p>
    ${lista.length ? `<div class="${cls.card} divide-y divide-slate-100">${lista.map((a) => `
      <div class="flex flex-wrap items-center gap-4 px-4 py-3">
        <p class="w-14 text-lg font-bold tabular-nums text-slate-900">${fmt.hora(a.inicio)}</p>
        <div class="min-w-0 flex-1"><p class="font-semibold">${esc(a.pessoa.nome)}</p><p class="text-xs text-slate-500">${esc(a.profissional?.nomeExibicao ?? '')} · ${esc(a.especialidade?.nome ?? '')} · <span class="font-mono">${esc(a.beneficiario?.numeroCarteirinha ?? 'particular')}</span> · via ${esc(a.origem.toLowerCase())}</p></div>
        ${badge(a.status)}
        <div class="flex flex-wrap gap-1">${(proximos[a.status] ?? []).map(([s, r]) => `<button data-ag="${a.id}" data-status="${s}" class="${btn(s === 'CANCELADO' || s === 'FALTOU' ? 'fantasma' : 'secundario', 'py-1 text-xs')}">${r}</button>`).join('')}
          ${['CHECKIN', 'EM_ATENDIMENTO', 'CONFIRMADO', 'AGENDADO'].includes(a.status) && a.beneficiario && api.pode('parceiro.validar') ? `<a href="#/?carteirinha=${encodeURIComponent(a.beneficiario.numeroCarteirinha)}&agendamento=${a.id}" class="${btn('primario', 'py-1 text-xs')}">Registrar uso</a>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Nenhum agendamento neste dia.', 'calendario')}</div>`}`;
  const el = conteudo();
  el.querySelector('#ant').addEventListener('click', () => mover(-1));
  el.querySelector('#prox').addEventListener('click', () => mover(1));
  el.querySelector('#hoje').addEventListener('click', () => ((diaAgenda = new Date().toISOString().slice(0, 10)), renderizarRota()));
  el.querySelector('#dia').addEventListener('change', (e) => ((diaAgenda = e.target.value), renderizarRota()));
  el.querySelectorAll('[data-ag]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.status === 'CANCELADO' && !(await confirmar('Cancelar este agendamento? O associado será avisado.', { perigo: true, textoOk: 'Cancelar agendamento' }))) return;
      try {
        await api.parceiro.atualizarAgendamento(b.dataset.ag, b.dataset.status);
        toast('Agenda atualizada.');
        renderizarRota();
      } catch (e) {
        tratarErro(e);
      }
    }),
  );
}

// ---- Beneficiários atendidos ------------------------------------------------------------------

async function paginaBeneficiarios() {
  conteudo().innerHTML = `
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-2xl font-extrabold">Beneficiários atendidos</h1><p class="text-sm text-slate-500">Associados com atendimento ou agendamento neste estabelecimento</p></div>
    <input id="busca" placeholder="Buscar por nome ou carteirinha" class="${cls.input} sm:w-72"></div>
    <div id="lista">${carregando()}</div>`;
  const el = conteudo();
  const atualizar = async () => {
    const lista = await api.parceiro.beneficiariosAtendidos({ busca: el.querySelector('#busca').value });
    el.querySelector('#lista').innerHTML = lista.length
      ? `<div class="${cls.card} overflow-x-auto"><table class="w-full min-w-[760px]"><thead class="border-b border-slate-200 bg-slate-50/70"><tr>${['Beneficiário', 'Plano', 'Contrato', 'Usos', 'Economia gerada', 'Último contato', ''].map((c) => `<th class="${cls.th}">${c}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${lista
          .map((b) => `<tr>
          <td class="${cls.td}"><div class="flex items-center gap-3">${avatar(b.nome)}<div><p class="font-semibold text-slate-900">${esc(b.nome)}</p><p class="font-mono text-xs text-slate-500">${esc(b.numeroCarteirinha)}</p></div></div></td>
          <td class="${cls.td}">${esc(b.plano)}</td><td class="${cls.td}">${badge(b.statusContrato)}</td><td class="${cls.td}">${b.usos}</td><td class="${cls.td} text-emerald-700">${fmt.moeda(b.economia)}</td><td class="${cls.td} text-xs">${fmt.data(b.ultimo)}</td>
          <td class="${cls.td} whitespace-nowrap text-right"><button data-contato="${b.pessoaId}" class="${btn('fantasma', 'py-1 text-xs')}">Contato</button>${api.pode('parceiro.validar') ? `<a href="#/?carteirinha=${encodeURIComponent(b.numeroCarteirinha)}" class="${btn('secundario', 'py-1 text-xs')}">Atender</a>` : ''}</td></tr>`)
          .join('')}</tbody></table></div>`
      : `<div class="${cls.card}">${vazio('Nenhum beneficiário atendido ainda.')}</div>`;
    el.querySelectorAll('[data-contato]').forEach((b) =>
      b.addEventListener('click', () => {
        const ben = lista.find((x) => x.pessoaId === b.dataset.contato);
        const m = modal({
          titulo: `Contato de ${ben.nome.split(' ')[0]}`,
          corpo: `<form class="space-y-3">${campo('Celular (WhatsApp)', `<input name="celular" value="${esc(ben.celular ?? '')}" class="${cls.input}">`)}${campo('E-mail', `<input name="email" type="email" value="${esc(ben.email ?? '')}" class="${cls.input}">`)}
            <p class="text-xs text-slate-500">Apenas dados de contato podem ser alterados pela rede. A alteração fica registrada na auditoria do hospital.</p>
            <div class="flex justify-end gap-2"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">Salvar</button></div></form>`,
        });
        const f = m.el.querySelector('form');
        f.addEventListener('submit', (ev) => {
          ev.preventDefault();
          comCarregando(f.querySelector('button:not([type])'), async () => {
            try {
              await api.parceiro.atualizarContato(ben.pessoaId, dadosForm(f));
              m.fechar();
              toast('Contato atualizado.');
              atualizar();
            } catch (err) {
              tratarErro(err);
            }
          });
        });
      }),
    );
  };
  el.querySelector('#busca').addEventListener('input', debounce(atualizar, 250));
  await atualizar();
}

// ---- Transações -------------------------------------------------------------------------------

async function paginaTransacoes() {
  conteudo().innerHTML = `
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-2xl font-extrabold">Transações</h1><p class="text-sm text-slate-500">Descontos concedidos e enviados ao hospital para conciliação</p></div>
    <input id="busca" placeholder="Associado, item ou código" class="${cls.input} sm:w-72"></div>
    <div id="lista">${carregando()}</div>`;
  const el = conteudo();
  const atualizar = async () => {
    const lista = (await api.parceiro.transacoes({ busca: el.querySelector('#busca').value })).slice(0, 200);
    el.querySelector('#lista').innerHTML = lista.length
      ? `<div class="${cls.card} overflow-x-auto"><table class="w-full min-w-[860px]"><thead class="border-b border-slate-200 bg-slate-50/70"><tr>${['Data', 'Autorização', 'Associado', 'Item', 'Tabela', 'Desconto', 'Pago', 'Status', ''].map((c) => `<th class="${cls.th}">${c}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${lista
          .map((t) => `<tr class="${t.transacaoOriginalId ? 'bg-slate-50 text-slate-500' : ''}">
          <td class="${cls.td} whitespace-nowrap text-xs">${fmt.dataHora(t.ocorridaEm)}</td><td class="${cls.td} font-mono text-xs">${esc(t.codigoAutorizacao)}</td>
          <td class="${cls.td}">${esc(t.pessoa.nome)}</td><td class="${cls.td}">${esc(t.descricaoItem)}${t.profissional ? `<p class="text-xs text-slate-500">${esc(t.profissional.nomeExibicao)}</p>` : ''}</td>
          <td class="${cls.td} tabular-nums">${fmt.moeda(t.valorOriginal)}</td><td class="${cls.td} tabular-nums text-emerald-700">${fmt.moeda(t.valorDesconto)}</td><td class="${cls.td} tabular-nums font-semibold">${fmt.moeda(t.valorPagoBeneficiario)}</td>
          <td class="${cls.td}">${t.transacaoOriginalId ? badge('ESTORNADA', 'Estorno') : badge(t.status)}${t.loteRepasseId ? '<p class="mt-0.5 text-[11px] text-slate-400">em lote</p>' : ''}</td>
          <td class="${cls.td} text-right">${api.pode('parceiro.estornar') && t.status === 'CONFIRMADA' && !t.transacaoOriginalId && !t.loteRepasseId ? `<button data-estornar="${t.id}" class="${btn('fantasma', 'py-1 text-xs text-red-600')}">Estornar</button>` : ''}</td></tr>`)
          .join('')}</tbody></table></div>`
      : `<div class="${cls.card}">${vazio('Nenhuma transação encontrada.')}</div>`;
    el.querySelectorAll('[data-estornar]').forEach((b) =>
      b.addEventListener('click', async () => {
        const motivo = await confirmar('O estorno gera um lançamento negativo vinculado ao original (o registro original nunca é apagado).', { titulo: 'Estornar transação', textoOk: 'Estornar', perigo: true, pedirMotivo: true });
        if (!motivo) return;
        try {
          await api.parceiro.estornar(b.dataset.estornar, motivo);
          toast('Transação estornada.');
          atualizar();
        } catch (e) {
          tratarErro(e);
        }
      }),
    );
  };
  el.querySelector('#busca').addEventListener('input', debounce(atualizar, 250));
  await atualizar();
}

// ---- Repasses ----------------------------------------------------------------------------------

async function paginaRepasses() {
  const r = await api.parceiro.repasses();
  conteudo().innerHTML = `
    <h1 class="mb-1 text-2xl font-extrabold">Repasses e taxas</h1>
    <p class="mb-6 text-sm text-slate-500">Serviços inclusos no plano geram repasse do hospital; descontos geram taxa de intermediação ao hospital.</p>
    <div class="grid gap-3 sm:grid-cols-4">${kpi('Transações em aberto', fmt.numero(r.aberto.quantidade))}${kpi('Repasses a receber', fmt.moeda(r.aberto.repasses))}${kpi('Taxas a pagar', fmt.moeda(r.aberto.taxas))}${kpi('Saldo do período', fmt.moeda(Math.abs(r.aberto.liquido)), r.aberto.liquido >= 0 ? 'a receber' : 'a pagar')}</div>
    <h2 class="mb-2 mt-8 font-semibold">Lotes fechados pelo hospital</h2>
    ${r.lotes.length ? `<div class="${cls.card} divide-y divide-slate-100">${r.lotes.map((l) => `<div class="flex flex-wrap items-center gap-4 px-4 py-3 text-sm"><div class="min-w-0 flex-1"><p class="font-semibold">${fmt.data(l.periodoInicio)} a ${fmt.data(l.periodoFim)}</p><p class="text-xs text-slate-500">${l.quantidadeTransacoes} transações · descontos ${fmt.moeda(l.valorTotalDescontos)}</p></div><p class="text-right"><b>${fmt.moeda(Math.abs(l.valorLiquido))}</b><br><span class="text-xs text-slate-500">${l.valorLiquido >= 0 ? 'a receber' : 'a pagar'}</span></p>${badge(l.status)}</div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Nenhum lote ainda.')}</div>`}`;
}

// ---- Novo cliente (pré-adesão pela rede) ---------------------------------------------------------

async function paginaNovoCliente() {
  const planos = api.parceiro.planosDisponiveis();
  const minhas = await api.parceiro.minhasPreAdesoes();
  conteudo().innerHTML = `
    <div class="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section class="${cls.card} p-6"><h1 class="text-xl font-extrabold">Novo cliente</h1>
        <p class="mb-5 text-sm text-slate-500">Cadastre a adesão de um paciente ao clube. O hospital confere os dados e ativa o contrato.</p>
        <div id="form">${formularioAdesao(planos, { textoBotao: 'Enviar pré-adesão' })}</div></section>
      <aside><h2 class="mb-2 font-semibold">Pré-adesões enviadas</h2>
        ${minhas.length ? `<div class="${cls.card} divide-y divide-slate-100">${minhas.map((a) => `<div class="px-4 py-3 text-sm"><div class="flex items-center justify-between gap-2"><p class="truncate font-semibold">${esc(a.titular.nome)}</p>${badge(a.status)}</div><p class="text-xs text-slate-500">${esc(a.plano.nome)} · ${a.qtdBeneficiarios} vida(s) · ${fmt.data(a.criadoEm)}</p></div>`).join('')}</div>` : `<div class="${cls.card}">${vazio('Nenhuma pré-adesão ainda.', 'dependente')}</div>`}
      </aside>
    </div>`;
  const form = conteudo().querySelector('#form form');
  form.querySelector('[data-fechar]').remove();
  ligarFormularioAdesao(form, planos, async (dados) => {
    const a = await api.parceiro.preAdesao(dados);
    toast(`Pré-adesão ${a.numeroContrato} enviada ao hospital.`);
    renderizarRota();
  });
}

await garantirBanco();
document.body.classList.add('pronto');
iniciar();

