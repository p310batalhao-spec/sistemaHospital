// Criptografia via Web Crypto (disponível em http://127.0.0.1 / localhost, usado pelo Live Server).

const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** JSON com chaves ordenadas recursivamente — o hash não depende da ordem de inserção das chaves. */
export function jsonCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor && typeof valor === 'object')
    return `{${Object.keys(valor)
      .filter((k) => valor[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`)
      .join(',')}}`;
  return JSON.stringify(valor ?? null);
}

export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

/** Hash de senha simulado (no backend real: argon2id). */
export async function hashSenha(senha, sal) {
  return sha256(`${sal}:${senha}`);
}

// ---- Base32 (RFC 4648) e TOTP (RFC 6238) para o QR dinâmico da carteirinha ----

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Aleatorio(bytes = 20, rnd = Math.random) {
  return Array.from({ length: Math.ceil((bytes * 8) / 5) }, () => ALFABETO[Math.floor(rnd() * 32)]).join('');
}

function base32ParaBytes(b32) {
  let bits = '';
  for (const ch of b32.replace(/=+$/, '')) bits += ALFABETO.indexOf(ch).toString(2).padStart(5, '0');
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

export const PASSO_TOTP = 30;

export async function totp(segredo, instante = Date.now(), digitos = 6) {
  const contador = Math.floor(instante / 1000 / PASSO_TOTP);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(4, contador);
  const chave = await crypto.subtle.importKey('raw', base32ParaBytes(segredo), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', chave, msg));
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digitos).padStart(digitos, '0');
}

/** Aceita o passo atual e o anterior/seguinte (tolerância de relógio). */
export async function validarTotp(segredo, codigo, instante = Date.now()) {
  for (const desvio of [0, -1, 1]) {
    if ((await totp(segredo, instante + desvio * PASSO_TOTP * 1000)) === codigo) return true;
  }
  return false;
}
