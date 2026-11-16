// =============================================================================
// Regras de negócio puras (sem acesso a armazenamento) — RBAC, elegibilidade,
// cálculo de benefício e de repasses B2B. Serão portadas 1:1 para o NestJS.
// =============================================================================

import { addDias, centavos } from '../lib/util.js';

// ---- RBAC ---------------------------------------------------------------------

export const PAPEIS = {
  ADMIN_HOSPITAL: { nome: 'Administrador do hospital', portal: 'admin', permissoes: ['*'] },
  FINANCEIRO: {
    nome: 'Financeiro',
    portal: 'admin',
    permissoes: ['dashboard.ver', 'beneficiarios.ler', 'planos.ler', 'rede.ler', 'financeiro.*', 'b2b.*', 'auditoria.ler'],
  },
  RECEPCAO: {
    nome: 'Recepção',
    portal: 'admin',
    permissoes: ['dashboard.ver', 'beneficiarios.*', 'planos.ler', 'financeiro.ler', 'rede.ler'],
  },
  PARCEIRO_GESTOR: {
    nome: 'Gestor do credenciado',
    portal: 'parceiro',
    permissoes: ['parceiro.*'],
  },
  FARMACIA_BALCAO: {
    nome: 'Balcão de farmácia',
    portal: 'parceiro',
    permissoes: ['parceiro.validar', 'parceiro.transacionar', 'parceiro.transacoes'],
  },
  DENTISTA: {
    nome: 'Dentista',
    portal: 'parceiro',
    permissoes: ['parceiro.validar', 'parceiro.transacionar', 'parceiro.transacoes', 'parceiro.agenda', 'parceiro.beneficiarios'],
  },
  ASSOCIADO: { nome: 'Associado', portal: 'app', permissoes: ['app.*'] },
};

export function permissoesDe(codigosPapeis) {
  return [...new Set(codigosPapeis.flatMap((c) => PAPEIS[c]?.permissoes ?? []))];
}

export function temPermissao(permissoes, requerida) {
  const [recurso] = requerida.split('.');
  return permissoes.includes('*') || permissoes.includes(requerida) || permissoes.includes(`${recurso}.*`);
}

// ---- Elegibilidade -------------------------------------------------------------

export const ROTULO_RESULTADO = {
  ELEGIVEL: 'Elegível',
  EM_CARENCIA: 'Em carência',
  INADIMPLENTE: 'Inadimplente',
  SUSPENSO: 'Suspenso',
  CANCELADO: 'Cancelado',
  NAO_ENCONTRADO: 'Não encontrado',
  QR_INVALIDO: 'QR Code inválido ou expirado',
  LIMITE_ATINGIDO: 'Limite de uso atingido',
  FORA_DA_ABRANGENCIA: 'Fora da abrangência',
};

export function avaliarElegibilidade({ beneficiario, assinatura, hoje = new Date() }) {
  if (!beneficiario || !assinatura) return { resultado: 'NAO_ENCONTRADO', motivo: 'Beneficiário não localizado.' };
  if (assinatura.status === 'CANCELADA' || beneficiario.status === 'CANCELADO')
    return { resultado: 'CANCELADO', motivo: 'Contrato cancelado.' };
  if (assinatura.status === 'PENDENTE_ATIVACAO')
    return { resultado: 'SUSPENSO', motivo: 'Adesão aguardando ativação pelo hospital.' };
  if (assinatura.status === 'SUSPENSA' || beneficiario.status === 'SUSPENSO')
    return { resultado: 'SUSPENSO', motivo: 'Benefícios suspensos pela régua de cobrança.' };
  if (assinatura.status === 'INADIMPLENTE')
    return { resultado: 'INADIMPLENTE', motivo: 'Há mensalidade vencida em aberto.' };
  if (beneficiario.carenciaAte && new Date(beneficiario.carenciaAte) > hoje)
    return { resultado: 'EM_CARENCIA', motivo: `Carência geral até ${new Date(beneficiario.carenciaAte).toLocaleDateString('pt-BR')}.` };
  return { resultado: 'ELEGIVEL', motivo: 'Benefícios liberados.' };
}

// ---- Regra de benefício aplicável ------------------------------------------------

const ABRANGE = {
  PROPRIO: ['PROPRIA', 'TODAS'],
  CREDENCIADO: ['CREDENCIADA', 'TODAS'],
};

/** Regra de item > regra de categoria; depois maior `prioridade`. */
export function escolherRegra(regrasDoPlano, item, naturezaEstabelecimento) {
  const candidatas = regrasDoPlano.filter(
    (r) =>
      r.ativo &&
      ABRANGE[naturezaEstabelecimento].includes(r.abrangencia) &&
      (r.itemCatalogoId === item.id || (!r.itemCatalogoId && r.categoria === item.categoria)),
  );
  candidatas.sort(
    (a, b) => Number(!!b.itemCatalogoId) - Number(!!a.itemCatalogoId) || (b.prioridade ?? 0) - (a.prioridade ?? 0),
  );
  return candidatas[0] ?? null;
}

export function inicioPeriodo(periodicidade, hoje, inicioVigencia) {
  const h = new Date(hoje);
  switch (periodicidade) {
    case 'DIA':
      return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()));
    case 'MES':
      return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1));
    case 'ANO':
      return new Date(Date.UTC(h.getUTCFullYear(), 0, 1));
    default:
      return new Date(inicioVigencia);
  }
}

export const ROTULO_TIPO_REGRA = {
  INCLUSO: 'Incluso no plano',
  DESCONTO_PERCENTUAL: 'Desconto',
  PRECO_FIXO: 'Preço fixo',
  COPARTICIPACAO_PERCENTUAL: 'Coparticipação',
  COPARTICIPACAO_VALOR: 'Coparticipação',
};

export function descreverRegra(regra) {
  if (!regra) return 'Sem benefício';
  const v = Number(regra.valor);
  switch (regra.tipoRegra) {
    case 'INCLUSO':
      return regra.limiteQuantidade ? `Incluso (${regra.limiteQuantidade}/${rotuloPeriodo(regra.periodicidadeLimite)})` : 'Incluso';
    case 'DESCONTO_PERCENTUAL':
      return `${v}% de desconto`;
    case 'PRECO_FIXO':
      return `Preço fixo ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    case 'COPARTICIPACAO_PERCENTUAL':
      return `Coparticipação de ${v}%`;
    case 'COPARTICIPACAO_VALOR':
      return `Coparticipação ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    default:
      return regra.tipoRegra;
  }
}

const rotuloPeriodo = (p) => ({ DIA: 'dia', MES: 'mês', ANO: 'ano', VIGENCIA: 'vigência' })[p] ?? 'período';

/**
 * Calcula o benefício de um uso. `usosNoPeriodo` = quantidade já consumida desta regra
 * no período de limite. Retorna `permitido=false` com o motivo quando bloqueado.
 */
export function calcularBeneficio({ regra, item, preco, valorInformado, quantidade = 1, beneficiario, usosNoPeriodo = 0, hoje = new Date() }) {
  const precoUnitario = Number(valorInformado ?? preco?.precoParticular ?? item.precoParticularReferencia);
  const valorOriginal = centavos(precoUnitario * quantidade);
  const base = { valorOriginal, valorDesconto: 0, valorPago: valorOriginal, valorCoparticipacao: 0, regra };

  if (!regra) return { ...base, permitido: false, resultado: 'FORA_DA_ABRANGENCIA', motivo: 'Este item não tem benefício no plano para este estabelecimento.' };

  if (beneficiario.tipo === 'DEPENDENTE' && !regra.aplicaDependentes)
    return { ...base, permitido: false, resultado: 'FORA_DA_ABRANGENCIA', motivo: 'Benefício exclusivo do titular.' };

  if (regra.carenciaDias) {
    const liberadoEm = addDias(beneficiario.inicioVigencia, regra.carenciaDias);
    if (liberadoEm > hoje)
      return { ...base, permitido: false, resultado: 'EM_CARENCIA', motivo: `Carência deste benefício até ${liberadoEm.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.` };
  }

  if (regra.limiteQuantidade && usosNoPeriodo + quantidade > regra.limiteQuantidade)
    return {
      ...base,
      permitido: false,
      resultado: 'LIMITE_ATINGIDO',
      motivo: `Limite de ${regra.limiteQuantidade} por ${rotuloPeriodo(regra.periodicidadeLimite)} atingido (${usosNoPeriodo} usado${usosNoPeriodo === 1 ? '' : 's'}).`,
    };

  const v = Number(regra.valor);
  let valorPago;
  switch (regra.tipoRegra) {
    case 'INCLUSO':
      valorPago = 0;
      break;
    case 'DESCONTO_PERCENTUAL':
      valorPago = valorOriginal * (1 - v / 100);
      break;
    case 'PRECO_FIXO':
    case 'COPARTICIPACAO_VALOR':
      valorPago = Math.min(v * quantidade, valorOriginal);
      break;
    case 'COPARTICIPACAO_PERCENTUAL':
      valorPago = valorOriginal * (v / 100);
      break;
    default:
      valorPago = valorOriginal;
  }
  // Preço negociado com o estabelecimento prevalece quando é melhor para o associado.
  if (regra.tipoRegra !== 'INCLUSO' && preco?.precoClube != null) valorPago = Math.min(valorPago, Number(preco.precoClube) * quantidade);

  valorPago = centavos(valorPago);
  return {
    permitido: true,
    resultado: 'ELEGIVEL',
    motivo: descreverRegra(regra),
    regra,
    valorOriginal,
    valorPago,
    valorDesconto: centavos(valorOriginal - valorPago),
    valorCoparticipacao: regra.tipoRegra.startsWith('COPARTICIPACAO') ? valorPago : 0,
  };
}

// ---- Repasses / comissões -------------------------------------------------------

/**
 * Credenciado + serviço INCLUSO → matriz paga o parceiro (repasse).
 * Credenciado + desconto       → parceiro paga taxa de intermediação à matriz.
 * Rede própria com profissional → matriz paga comissão ao profissional.
 */
export function calcularRepasses({ regrasRepasse, estabelecimento, profissionalId, item, tipoRegra, valores, quantidade = 1, hoje = new Date() }) {
  const resultado = { valorRepasseParceiro: 0, valorTaxaMatriz: 0, valorComissaoProfissional: 0, aplicadas: [] };

  let sentido = null;
  if (estabelecimento.natureza === 'CREDENCIADO') sentido = tipoRegra === 'INCLUSO' ? 'MATRIZ_PAGA_PARCEIRO' : 'PARCEIRO_PAGA_MATRIZ';
  else if (profissionalId) sentido = 'MATRIZ_PAGA_PROFISSIONAL';
  if (!sentido) return resultado;

  const vigente = (r) => new Date(r.vigenciaInicio) <= hoje && (!r.vigenciaFim || new Date(r.vigenciaFim) >= hoje);
  const candidatas = regrasRepasse
    .filter(
      (r) =>
        r.ativa &&
        r.sentido === sentido &&
        vigente(r) &&
        (!r.estabelecimentoId || r.estabelecimentoId === estabelecimento.id) &&
        (!r.profissionalId || r.profissionalId === profissionalId) &&
        (!r.categoria || r.categoria === item.categoria) &&
        (!r.itemCatalogoId || r.itemCatalogoId === item.id),
    )
    .map((r) => ({
      r,
      especificidade: (r.itemCatalogoId ? 8 : 0) + (r.profissionalId ? 4 : 0) + (r.estabelecimentoId ? 2 : 0) + (r.categoria ? 1 : 0),
    }))
    .sort((a, b) => b.especificidade - a.especificidade || (b.r.prioridade ?? 0) - (a.r.prioridade ?? 0));

  const regra = candidatas[0]?.r;
  if (!regra) return resultado;

  const base = { VALOR_ORIGINAL: valores.valorOriginal, VALOR_PAGO: valores.valorPago, VALOR_DESCONTO: valores.valorDesconto }[regra.baseCalculo];
  const valor = centavos(regra.tipoValor === 'PERCENTUAL' ? (base * Number(regra.valor)) / 100 : Number(regra.valor) * quantidade);

  if (sentido === 'MATRIZ_PAGA_PARCEIRO') resultado.valorRepasseParceiro = valor;
  if (sentido === 'PARCEIRO_PAGA_MATRIZ') resultado.valorTaxaMatriz = valor;
  if (sentido === 'MATRIZ_PAGA_PROFISSIONAL') resultado.valorComissaoProfissional = valor;
  resultado.aplicadas.push({ id: regra.id, nome: regra.nome, sentido, tipoValor: regra.tipoValor, valor: regra.valor, baseCalculo: regra.baseCalculo });
  return resultado;
}
