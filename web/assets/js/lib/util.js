// Utilitários compartilhados (formatação, escape, PRNG determinístico).

/** Escapa texto para interpolar com segurança em templates HTML. */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const fmt = {
  moeda: (v) => moeda.format(Number(v) || 0),
  numero: (v) => numero.format(Number(v) || 0),
  pct: (v) => pct.format(Number(v) || 0),
  data: (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'),
  dataHora: (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'),
  hora: (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  mes: (d) => {
    const dt = new Date(d);
    return `${dt.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}/${String(dt.getUTCFullYear()).slice(2)}`;
  },
  cpf: (c) => (c ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '—'),
  cpfMascarado: (c) => (c ? `***.${c.slice(3, 6)}.***-${c.slice(9)}` : '—'),
  cnpj: (c) =>
    c?.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : fmt.cpf(c),
  telefone: (t) => (t ? t.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '—'),
};

export const somenteDigitos = (s) => String(s ?? '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const c = somenteDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9)) === Number(c[9]) && dv(c.slice(0, 10)) === Number(c[10]);
}

/** Arredonda para centavos evitando erros de ponto flutuante. */
export const centavos = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export const uuid = () => crypto.randomUUID();

export const hojeISO = () => new Date().toISOString().slice(0, 10);

export function addDias(data, dias) {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

export function addMeses(data, meses) {
  const d = new Date(data);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

export const inicioMes = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export const diasEntre = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86_400_000);

export function idade(nascimento) {
  const n = new Date(nascimento);
  const h = new Date();
  let i = h.getUTCFullYear() - n.getUTCFullYear();
  if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) i--;
  return i;
}

/** Distância em km (haversine). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** PRNG determinístico (mulberry32) — o seed gera sempre os mesmos dados fictícios. */
export function criarPrng(semente) {
  let s = semente >>> 0;
  const prox = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    num: prox,
    int: (min, max) => Math.floor(prox() * (max - min + 1)) + min,
    item: (lista) => lista[Math.floor(prox() * lista.length)],
    chance: (p) => prox() < p,
    digitos: (n) => Array.from({ length: n }, () => Math.floor(prox() * 10)).join(''),
  };
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const iniciais = (nome) =>
  String(nome ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
