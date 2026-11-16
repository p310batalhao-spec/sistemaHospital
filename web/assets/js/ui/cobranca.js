// Exibição de cobrança SIMULADA (Pix / boleto) — usada no painel e no app.

import { barrasSvg, CHAVE_PIX_SIMULADA, qrSvg } from '../lib/pagamentos-fake.js';
import { esc, fmt } from '../lib/util.js';
import { btn, comCarregando, copiar, icone, modal, toast, tratarErro } from './ui.js';

const ROTULO_METODO = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO_CREDITO: 'Cartão de crédito' };

function corpoCobranca(cobranca, fatura) {
  const aviso = `<div class="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">${icone('alerta', 'size-4 shrink-0')}<span><b>Simulação.</b> Este código não é pagável: ${cobranca.metodo === 'PIX' ? `a chave <code>${CHAVE_PIX_SIMULADA}</code> não existe` : cobranca.metodo === 'BOLETO' ? 'o banco 000 não existe' : 'o link aponta para um domínio .invalid'}. Use “Simular pagamento”.</span></div>`;
  const cabecalho = `<div class="mb-4 flex items-end justify-between gap-4"><div><p class="text-xs uppercase tracking-wide text-slate-500">Fatura ${esc(fatura.numero)}</p><p class="text-2xl font-extrabold text-slate-900">${fmt.moeda(cobranca.valor)}</p></div><p class="text-right text-xs text-slate-500">Vencimento<br><b class="text-sm text-slate-800">${fmt.data(cobranca.boletoVencimento ?? fatura.vencimento)}</b></p></div>`;

  let corpo = '';
  if (cobranca.metodo === 'PIX') {
    corpo = `
      <div class="mx-auto w-56 rounded-2xl bg-white p-2 ring-1 ring-slate-200 [&_svg]:h-auto [&_svg]:w-full">${qrSvg(cobranca.pixCopiaECola, 5)}</div>
      <p class="mt-3 text-center text-xs text-slate-500" data-expira="${esc(cobranca.pixExpiraEm)}">Expira em —</p>
      <label class="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pix copia e cola</label>
      <div class="mt-1 flex gap-2">
        <textarea readonly rows="3" class="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">${esc(cobranca.pixCopiaECola)}</textarea>
      </div>
      <button type="button" data-copiar="${esc(cobranca.pixCopiaECola)}" class="${btn('secundario', 'mt-2 w-full')}">${icone('copiar', 'size-4')} Copiar código Pix</button>`;
  } else if (cobranca.metodo === 'BOLETO') {
    corpo = `
      <div class="rounded-xl bg-white p-3 text-slate-900 ring-1 ring-slate-200">${barrasSvg(cobranca.boletoCodigoBarras)}</div>
      <label class="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Linha digitável</label>
      <p class="mt-1 break-all rounded-lg bg-slate-50 p-2 font-mono text-sm text-slate-800 ring-1 ring-slate-200">${esc(cobranca.boletoLinhaDigitavel)}</p>
      <button type="button" data-copiar="${esc(cobranca.boletoLinhaDigitavel.replace(/\D/g, ''))}" class="${btn('secundario', 'mt-2 w-full')}">${icone('copiar', 'size-4')} Copiar linha digitável</button>`;
  } else {
    corpo = `<p class="text-sm text-slate-600">Link de pagamento com cartão (simulado):</p><p class="mt-1 break-all font-mono text-xs text-slate-500">${esc(cobranca.linkPagamento)}</p>`;
  }
  return `${aviso}${cabecalho}${corpo}
    <p class="mt-4 text-[11px] text-slate-400">ID no gateway (simulado): ${esc(cobranca.gatewayCobrancaId)}</p>
    <button type="button" data-simular class="${btn('primario', 'mt-4 w-full')}">${icone('check', 'size-4')} Simular pagamento (webhook)</button>`;
}

/**
 * Abre o modal de cobrança. `emitir(metodo)` e `pagar(cobrancaId)` vêm da API do portal.
 * Se `metodo` não for informado, pergunta primeiro.
 */
export function abrirCobranca({ fatura, metodo, emitir, pagar, aoPagar }) {
  let timer;
  const limpar = () => clearInterval(timer);
  const m = modal({ titulo: 'Pagamento da fatura', corpo: '', largura: 'max-w-md', aoFechar: limpar });

  const escolher = () => {
    m.corpo.innerHTML = `
      <p class="text-sm text-slate-600">Fatura <b>${esc(fatura.numero)}</b> · ${fmt.moeda(fatura.valorTotal)} · vence ${fmt.data(fatura.vencimento)}</p>
      <div class="mt-4 grid gap-2">
        ${['PIX', 'BOLETO', 'CARTAO_CREDITO'].map((mt) => `<button type="button" data-metodo="${mt}" class="${btn('secundario', 'justify-start py-3')}">${icone(mt === 'PIX' ? 'qr' : mt === 'BOLETO' ? 'fatura' : 'cartao')} ${ROTULO_METODO[mt]}${mt === 'PIX' ? '<span class="ml-auto text-xs font-medium text-emerald-700">confirmação imediata</span>' : ''}</button>`).join('')}
      </div>`;
  };

  const mostrar = async (mt) => {
    try {
      m.corpo.innerHTML = '<div class="py-10 text-center text-sm text-slate-500">Gerando cobrança simulada…</div>';
      const cobranca = await emitir(fatura.id, mt);
      m.corpo.innerHTML = corpoCobranca(cobranca, { ...fatura, valorTotal: cobranca.valor });
      const exp = m.corpo.querySelector('[data-expira]');
      if (exp) {
        const tick = () => {
          const resta = new Date(exp.dataset.expira) - Date.now();
          if (resta <= 0) {
            exp.textContent = 'Código expirado — gere um novo.';
            exp.className = 'mt-3 text-center text-xs font-semibold text-red-600';
            return limpar();
          }
          const min = Math.floor(resta / 60000);
          const s = Math.floor((resta % 60000) / 1000);
          exp.textContent = `Expira em ${min}:${String(s).padStart(2, '0')}`;
        };
        tick();
        timer = setInterval(tick, 1000);
      }
      m.corpo.querySelector('[data-simular]').addEventListener('click', (e) =>
        comCarregando(e.currentTarget, async () => {
          try {
            const r = await pagar(cobranca.id);
            limpar();
            m.fechar();
            toast(r.reativada ? 'Pagamento confirmado e benefícios reativados!' : 'Pagamento confirmado (simulação).');
            aoPagar?.(r);
          } catch (err) {
            tratarErro(err);
          }
        }),
      );
    } catch (err) {
      tratarErro(err);
      m.fechar();
    }
  };

  m.corpo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-metodo]');
    if (b) mostrar(b.dataset.metodo);
    const c = e.target.closest('[data-copiar]');
    if (c) copiar(c.dataset.copiar);
  });

  metodo ? mostrar(metodo) : escolher();
  return m;
}
