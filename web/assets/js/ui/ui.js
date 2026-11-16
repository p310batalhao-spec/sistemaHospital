// Componentes de interface compartilhados pelos três portais (Tailwind via CDN).

import { esc, iniciais } from '../lib/util.js';

// ---- Classes utilitárias (mantém o visual consistente entre portais) ------------

export const cls = {
  btn: 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
  primario: 'bg-marca text-white hover:brightness-110 shadow-sm',
  secundario: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
  perigo: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-slate-600 hover:bg-slate-100',
  input: 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20',
  label: 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500',
  card: 'rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm',
  th: 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
  td: 'px-4 py-3 text-sm text-slate-700',
};

export const btn = (variante = 'primario', extra = '') => `${cls.btn} ${cls[variante]} ${extra}`;

// ---- Ícones (traços no estilo Lucide, desenhados inline) --------------------------

const PATHS = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  plano: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  predio: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  troca: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  mais: '<path d="M5 12h14M12 5v14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  cartao: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  mapa: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  casa: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  fatura: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 13h4M10 17h4M8 9h2"/>',
  perfil: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  estrela: '<path d="M11.5 2.3a.5.5 0 0 1 .9 0l2.3 4.7a2 2 0 0 0 1.6 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.4a2 2 0 0 0-1.9 0l-4.6 2.4a.5.5 0 0 1-.8-.6l.9-5.1a2 2 0 0 0-.6-1.9L1.9 9.8a.5.5 0 0 1 .3-.9l5.2-.8A2 2 0 0 0 9 7l2.3-4.7Z"/>',
  sino: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
  coracao: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  copiar: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  pilula: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  dente: '<path d="M12 5.5c-1.5-2-6-2.5-7 .5-1 3 .5 5 1 7.5S7 21 8.5 21s1.5-4 3.5-4 2 4 3.5 4 1-5 1.5-7.5 2-4.5 1-7.5c-1-3-5.5-2.5-7-.5Z"/>',
  estetoscopio: '<path d="M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  frasco: '<path d="M9 3h6M10 9V3M14 9V3"/><path d="M6.5 21h11a2 2 0 0 0 1.8-2.9L14 9h-4l-5.3 9.1A2 2 0 0 0 6.5 21Z"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  seringa: '<path d="m18 2 4 4M17 7l3-3M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6"/>',
  atividade: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  bisturi: '<path d="M3 21 14 10l3 3L6 21z"/><path d="m14 10 5-5a2.1 2.1 0 0 1 3 3l-5 5"/>',
  sirene: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l.71.71"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  recarregar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  dependente: '<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><path d="M19 16v6M16 19h6"/>',
};

export const icone = (nome, classe = 'size-5') =>
  `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[nome] ?? ''}</svg>`;

export const ICONE_CATEGORIA = {
  CONSULTA: 'estetoscopio', EXAME_LABORATORIAL: 'frasco', EXAME_IMAGEM: 'imagem', ODONTOLOGIA: 'dente', FARMACIA: 'pilula',
  VACINA: 'seringa', TERAPIA: 'atividade', CIRURGIA_ELETIVA: 'bisturi', INTERNACAO: 'predio', PRONTO_ATENDIMENTO: 'sirene', OUTRO: 'plano',
};

export const ROTULO_CATEGORIA = {
  CONSULTA: 'Consultas', EXAME_LABORATORIAL: 'Exames laboratoriais', EXAME_IMAGEM: 'Exames de imagem', ODONTOLOGIA: 'Odontologia',
  FARMACIA: 'Farmácia', VACINA: 'Vacinas', TERAPIA: 'Terapias', CIRURGIA_ELETIVA: 'Cirurgias eletivas', INTERNACAO: 'Internação',
  PRONTO_ATENDIMENTO: 'Pronto atendimento', OUTRO: 'Outros',
};

export const ROTULO_TIPO_ESTAB = {
  HOSPITAL: 'Hospital', CLINICA: 'Clínica', CONSULTORIO: 'Consultório', LABORATORIO: 'Laboratório', CENTRO_IMAGEM: 'Centro de imagem',
  FARMACIA: 'Farmácia', CLINICA_ODONTOLOGICA: 'Clínica odontológica', PROFISSIONAL_AUTONOMO: 'Profissional autônomo', HOSPITAL_CONVENIADO: 'Hospital conveniado',
};

export const ROTULO_PARENTESCO = { CONJUGE: 'Cônjuge', FILHO: 'Filho(a)', ENTEADO: 'Enteado(a)', PAI: 'Pai', MAE: 'Mãe', NETO: 'Neto(a)', IRMAO: 'Irmão(ã)', OUTRO: 'Outro' };

// ---- Status → badge -------------------------------------------------------------

const TONS = {
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amarelo: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  vermelho: 'bg-red-50 text-red-700 ring-red-600/20',
  cinza: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  azul: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  roxo: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const STATUS = {
  ATIVA: ['Ativa', 'verde'], ATIVO: ['Ativo', 'verde'], INADIMPLENTE: ['Inadimplente', 'amarelo'], SUSPENSA: ['Suspensa', 'vermelho'], SUSPENSO: ['Suspenso', 'vermelho'],
  CANCELADA: ['Cancelada', 'cinza'], CANCELADO: ['Cancelado', 'cinza'], PENDENTE_ATIVACAO: ['Aguardando ativação', 'azul'],
  ABERTA: ['Em aberto', 'azul'], PAGA: ['Paga', 'verde'], VENCIDA: ['Vencida', 'vermelho'], RENEGOCIADA: ['Renegociada', 'roxo'], ESTORNADA: ['Estornada', 'cinza'],
  PENDENTE: ['Pendente', 'azul'], RECEBIDA: ['Recebida', 'verde'], CONFIRMADA: ['Confirmada', 'verde'], AUTORIZADA: ['Autorizada', 'azul'], CONTESTADA: ['Contestada', 'amarelo'],
  EM_ANALISE: ['Em análise', 'amarelo'], DESCREDENCIADO: ['Descredenciado', 'cinza'],
  PENDENTE_APROVACAO: ['Aguardando aprovação', 'amarelo'], BLOQUEADO: ['Bloqueado', 'vermelho'], REVOGADO: ['Revogado', 'cinza'],
  AGENDADO: ['Agendado', 'azul'], CONFIRMADO: ['Confirmado', 'verde'], CHECKIN: ['Check-in', 'roxo'], EM_ATENDIMENTO: ['Em atendimento', 'roxo'], ATENDIDO: ['Atendido', 'cinza'], FALTOU: ['Faltou', 'vermelho'], REMARCADO: ['Remarcado', 'cinza'], SOLICITADO: ['Solicitado', 'azul'],
  FECHADO: ['Fechado', 'azul'], APROVADO: ['Aprovado', 'roxo'], PAGO: ['Pago', 'verde'], ABERTO: ['Aberto', 'amarelo'],
  ELEGIVEL: ['Elegível', 'verde'], EM_CARENCIA: ['Em carência', 'amarelo'], NAO_ENCONTRADO: ['Não encontrado', 'cinza'], QR_INVALIDO: ['QR inválido', 'vermelho'], LIMITE_ATINGIDO: ['Limite atingido', 'amarelo'], FORA_DA_ABRANGENCIA: ['Sem cobertura', 'cinza'],
  ENVIADA: ['Enviada', 'azul'], ENTREGUE: ['Entregue', 'verde'], LIDA: ['Lida', 'verde'], FALHOU: ['Falhou', 'vermelho'],
  PROPRIO: ['Rede própria', 'roxo'], CREDENCIADO: ['Credenciado', 'azul'],
};

export function badge(status, rotulo) {
  const [texto, tom] = STATUS[status] ?? [status, 'cinza'];
  return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${TONS[tom]}">${esc(rotulo ?? texto)}</span>`;
}

export const rotuloStatus = (status) => STATUS[status]?.[0] ?? status;

export const avatar = (nome, tamanho = 'size-9', cor = 'bg-marca/10 text-marca') =>
  `<span class="inline-flex ${tamanho} shrink-0 items-center justify-center rounded-full ${cor} text-xs font-bold">${esc(iniciais(nome))}</span>`;

export function estrelas(nota, tamanho = 'size-4') {
  const n = Math.round(Number(nota) || 0);
  return `<span class="inline-flex text-amber-400" aria-label="${n} de 5 estrelas">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? '' : 'text-slate-200'}">${icone('estrela', `${tamanho} fill-current`)}</span>`).join('')}</span>`;
}

// ---- Branding white label -------------------------------------------------------

export function aplicarBranding(branding) {
  if (!branding) return;
  const raiz = document.documentElement.style;
  raiz.setProperty('--marca', branding.corPrimaria);
  raiz.setProperty('--marca-clara', branding.corSecundaria);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.corPrimaria);
}

// ---- Toast ------------------------------------------------------------------------

export function toast(mensagem, tipo = 'sucesso') {
  let area = document.getElementById('toasts');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toasts';
    area.className = 'fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none';
    area.setAttribute('aria-live', 'polite');
    document.body.append(area);
  }
  const cor = { sucesso: 'bg-slate-900', erro: 'bg-red-600', info: 'bg-sky-700' }[tipo];
  const el = document.createElement('div');
  el.className = `${cor} pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg transition duration-300`;
  el.textContent = mensagem;
  area.append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

export function tratarErro(e) {
  console.error(e);
  toast(e?.message || 'Erro inesperado.', 'erro');
  if (e?.status === 401) setTimeout(() => location.reload(), 900);
}

// ---- Modal ------------------------------------------------------------------------

/** Abre um modal. `corpo` é HTML; retorna { el, fechar }. */
export function modal({ titulo, corpo, largura = 'max-w-lg', aoFechar } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4';
  fundo.innerHTML = `
    <div role="dialog" aria-modal="true" class="w-full ${largura} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
      <div class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
        <h2 class="text-base font-semibold text-slate-900">${esc(titulo)}</h2>
        <button type="button" data-fechar class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="p-5" data-corpo>${corpo}</div>
    </div>`;
  const fechar = () => {
    fundo.remove();
    document.removeEventListener('keydown', esc_);
    aoFechar?.();
  };
  const esc_ = (e) => e.key === 'Escape' && fechar();
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo || e.target.closest('[data-fechar]')) fechar();
  });
  document.addEventListener('keydown', esc_);
  document.body.append(fundo);
  fundo.querySelector('input,select,textarea')?.focus();
  return { el: fundo, corpo: fundo.querySelector('[data-corpo]'), fechar };
}

export function confirmar(mensagem, { titulo = 'Confirmar', textoOk = 'Confirmar', perigo = false, pedirMotivo = false } = {}) {
  return new Promise((resolver) => {
    let resolvido = false;
    const m = modal({
      titulo,
      corpo: `<p class="text-sm text-slate-600">${esc(mensagem)}</p>
        ${pedirMotivo ? `<label class="mt-4 block"><span class="${cls.label}">Motivo</span><input name="motivo" required class="${cls.input}"></label>` : ''}
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" data-fechar class="${btn('secundario')}">Voltar</button>
          <button type="button" data-ok class="${btn(perigo ? 'perigo' : 'primario')}">${esc(textoOk)}</button>
        </div>`,
      aoFechar: () => !resolvido && resolver(null),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      const motivo = m.el.querySelector('[name=motivo]')?.value.trim();
      if (pedirMotivo && !motivo) return toast('Informe o motivo.', 'erro');
      resolvido = true;
      m.fechar();
      resolver(pedirMotivo ? motivo : true);
    });
  });
}

// ---- Formulários --------------------------------------------------------------------

export function dadosForm(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) dados[el.name] = el.value;
    } else dados[el.name] = el.value.trim();
  }
  return dados;
}

/** Desabilita o botão de envio enquanto a promessa roda. */
export async function comCarregando(botao, fn) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = `<span class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span> Aguarde…`;
  try {
    return await fn();
  } finally {
    botao.disabled = false;
    botao.innerHTML = original;
  }
}

export const campo = (rotulo, input, dica = '') =>
  `<label class="block"><span class="${cls.label}">${esc(rotulo)}</span>${input}${dica ? `<span class="mt-1 block text-xs text-slate-400">${esc(dica)}</span>` : ''}</label>`;

export const opcoes = (lista, selecionado = '') =>
  lista.map(([valor, rotulo]) => `<option value="${esc(valor)}" ${String(valor) === String(selecionado) ? 'selected' : ''}>${esc(rotulo)}</option>`).join('');

// ---- Roteador por hash --------------------------------------------------------------

export function roteador(rotas, aoNavegar) {
  const resolver = () => {
    const [caminho, consulta = ''] = (location.hash.slice(1) || '/').split('?');
    const partes = caminho.split('/').filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(consulta));
    for (const [padrao, fn] of Object.entries(rotas)) {
      const p = padrao.split('/').filter(Boolean);
      if (p.length !== partes.length) continue;
      const vars = {};
      if (p.every((seg, i) => (seg.startsWith(':') ? ((vars[seg.slice(1)] = decodeURIComponent(partes[i])), true) : seg === partes[i]))) {
        aoNavegar({ rota: padrao, fn, params: { ...vars, ...params } });
        return;
      }
    }
    location.hash = '#/';
  };
  window.addEventListener('hashchange', resolver);
  resolver();
  /** Para de ouvir a navegação (usado no logout). */
  return () => window.removeEventListener('hashchange', resolver);
}

export const carregando = (texto = 'Carregando…') =>
  `<div class="flex items-center justify-center gap-3 py-20 text-sm text-slate-500"><span class="size-5 animate-spin rounded-full border-2 border-marca border-t-transparent"></span>${esc(texto)}</div>`;

export const vazio = (texto, icon = 'busca') =>
  `<div class="flex flex-col items-center justify-center gap-2 py-14 text-center text-sm text-slate-500"><span class="text-slate-300">${icone(icon, 'size-10')}</span>${esc(texto)}</div>`;

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado para a área de transferência.');
  } catch {
    toast('Não foi possível copiar automaticamente. Selecione e copie o texto.', 'erro');
  }
}

/** Aviso fixo: todos os dados são fictícios. */
export const faixaSimulacao = () =>
  `<div class="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">Ambiente de simulação — todos os dados são fictícios e os Pix/boletos não são pagáveis.</div>`;
