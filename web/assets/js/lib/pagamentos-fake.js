// =============================================================================
// GATEWAY DE PAGAMENTO SIMULADO — NENHUM CÓDIGO AQUI É PAGÁVEL.
// Pix: BR Code com estrutura EMV válida, porém com chave "simulacao@elosaude.invalid"
//      (domínio reservado .invalid — não existe no DICT).
// Boleto: linha digitável bem formada (DVs mod10/mod11), com banco "000" inexistente.
// Substituir por Asaas / Mercado Pago / Stripe na integração real.
// =============================================================================

const ascii = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase();

const tlv = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export const CHAVE_PIX_SIMULADA = 'simulacao@elosaude.invalid';

export function gerarPixSimulado({ valor, txid, recebedor, cidade }) {
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', CHAVE_PIX_SIMULADA) + tlv('02', 'SIMULACAO NAO PAGAR');
  let payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', conta) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', Number(valor).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', ascii(recebedor).slice(0, 25)) +
    tlv('60', ascii(cidade).slice(0, 15)) +
    tlv('62', tlv('05', ascii(txid).replace(/ /g, '').slice(0, 25)));
  payload += '6304';
  return payload + crc16(payload);
}

// ---- Boleto -------------------------------------------------------------------

function mod10(num) {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function mod11(num) {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv >= 10 ? 1 : dv;
}

/** Fator de vencimento FEBRABAN, já com o reinício em 22/02/2025 (fator 1000). */
function fatorVencimento(vencimento) {
  const dias = Math.round((Date.parse(vencimento) - Date.UTC(1997, 9, 7)) / 86_400_000);
  return String(dias > 9999 ? ((dias - 10000) % 9000) + 1000 : dias).padStart(4, '0');
}

export const BANCO_SIMULADO = '000';

export function gerarBoletoSimulado({ valor, vencimento, nossoNumero }) {
  const banco = BANCO_SIMULADO;
  const moeda = '9';
  const fator = fatorVencimento(vencimento);
  const valorStr = String(Math.round(Number(valor) * 100)).padStart(10, '0');
  const campoLivre = String(nossoNumero).replace(/\D/g, '').padStart(25, '0').slice(-25);

  const semDv = banco + moeda + fator + valorStr + campoLivre;
  const dv = mod11(semDv);
  const codigoBarras = banco + moeda + dv + fator + valorStr + campoLivre;

  const c1 = banco + moeda + campoLivre.slice(0, 5);
  const c2 = campoLivre.slice(5, 15);
  const c3 = campoLivre.slice(15, 25);
  const campo1 = c1 + mod10(c1);
  const campo2 = c2 + mod10(c2);
  const campo3 = c3 + mod10(c3);
  const linhaDigitavel =
    `${campo1.slice(0, 5)}.${campo1.slice(5)} ${campo2.slice(0, 5)}.${campo2.slice(5)} ` +
    `${campo3.slice(0, 5)}.${campo3.slice(5)} ${dv} ${fator}${valorStr}`;

  return { codigoBarras, linhaDigitavel };
}

/** Código de barras Interleaved 2 of 5 (padrão dos boletos) como SVG. */
export function barrasSvg(codigo, { altura = 56, estreita = 1.2 } = {}) {
  const padroes = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
  const larga = estreita * 3;
  const w = (c) => (c === 'w' ? larga : estreita);
  const elementos = ['n', 'n', 'n', 'n']; // início: barra/espaço/barra/espaço estreitos
  for (let i = 0; i < codigo.length; i += 2) {
    const barras = padroes[Number(codigo[i])];
    const espacos = padroes[Number(codigo[i + 1])];
    for (let k = 0; k < 5; k++) elementos.push(barras[k], espacos[k]);
  }
  elementos.push('w', 'n', 'n'); // fim

  let x = 10 * estreita;
  let rects = '';
  elementos.forEach((el, i) => {
    const largura = w(el);
    if (i % 2 === 0) rects += `<rect x="${x.toFixed(2)}" y="0" width="${largura.toFixed(2)}" height="${altura}"/>`;
    x += largura;
  });
  const total = x + 10 * estreita;
  return `<svg viewBox="0 0 ${total.toFixed(2)} ${altura}" width="100%" height="${altura}" preserveAspectRatio="none" role="img" aria-label="Código de barras simulado" fill="currentColor">${rects}</svg>`;
}

/** QR Code SVG (biblioteca qrcode-generator carregada via CDN como global `qrcode`). */
export function qrSvg(texto, tamanhoCelula = 4) {
  if (typeof window.qrcode !== 'function') return '<div class="text-xs text-red-600">Biblioteca de QR não carregada</div>';
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: tamanhoCelula, margin: 2, scalable: true });
}
