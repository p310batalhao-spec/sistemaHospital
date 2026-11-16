// =============================================================================
// BACKEND SIMULADO (roda no navegador). Mesmas responsabilidades da futura API
// NestJS: autenticação, RBAC, isolamento por tenant ("RLS"), auditoria com
// cadeia de hash, motor de benefícios, cobrança SIMULADA e repasses B2B.
// Para migrar: trocar cada método por fetch() no endpoint REST equivalente.
// =============================================================================

import { db } from './db.js';
import { gerarSeed } from './seed.js';
import { PAPEIS, avaliarElegibilidade, calcularBeneficio, calcularRepasses, escolherRegra, inicioPeriodo, permissoesDe, temPermissao } from './regras.js';
import { base32Aleatorio, hashSenha, jsonCanonico, sha256, validarTotp } from '../lib/crypto.js';
import { gerarBoletoSimulado, gerarPixSimulado } from '../lib/pagamentos-fake.js';
import { addDias, addMeses, centavos, cpfValido, diasEntre, distanciaKm, idade, inicioMes, somenteDigitos } from '../lib/util.js';

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
const VALIDADE_PIX_MIN = 60;
const latencia = () => new Promise((r) => setTimeout(r, 60));
const iso = (d = new Date()) => new Date(d).toISOString();
const isoDia = (d) => new Date(d).toISOString().slice(0, 10);
const soma = (lista, campo) => centavos(lista.reduce((s, x) => s + Number(x[campo] ?? 0), 0));

export async function garantirBanco() {
  if (!db.existe()) db.restaurar(await gerarSeed());
}

export async function resetarBanco() {
  db.apagar();
  for (const p of ['admin', 'parceiro', 'app']) localStorage.removeItem(`elosaude.sessao.${p}`);
  db.restaurar(await gerarSeed());
}

export const aoMudarDados = (fn) => db.aoMudar(fn);

// ---- Consultas públicas (antes do login) --------------------------------------

export function listarTenants() {
  return db.todos('tenants').map((t) => ({ ...t, branding: db.um('tenantBranding', (b) => b.tenantId === t.id) }));
}

export function brandingDoTenant(tenantId) {
  return db.um('tenantBranding', (b) => b.tenantId === tenantId);
}

/** SOMENTE SIMULADOR: sugere titulares fictícios sem acesso ao app, para testar o "primeiro acesso". */
export function sugestoesPrimeiroAcesso(tenantSlug) {
  const tenant = db.um('tenants', (t) => t.slug === tenantSlug);
  if (!tenant) return [];
  const comAcesso = new Set(db.onde('membros', (m) => m.pessoaId).map((m) => m.pessoaId));
  return db
    .onde('assinaturas', (a) => a.tenantId === tenant.id && a.status === 'ATIVA' && !comAcesso.has(a.titularId))
    .slice(0, 3)
    .map((a) => db.porId('pessoas', a.titularId))
    .map((p) => ({ nome: p.nome, cpf: p.cpf, dataNascimento: p.dataNascimento }));
}

// =============================================================================

export function criarApi(portal) {
  const CHAVE_SESSAO = `elosaude.sessao.${portal}`;
  let sessao = lerSessao();

  function lerSessao() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO));
      return s && s.exp > Date.now() ? s : null;
    } catch {
      return null;
    }
  }

  function exigir(permissao) {
    sessao = lerSessao();
    if (!sessao) throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
    if (permissao && !temPermissao(sessao.permissoes, permissao)) throw new ErroApi(403, 'Seu perfil não tem permissão para esta ação.');
    return sessao;
  }

  // "RLS": toda leitura passa pelo tenant da sessão.
  const doTenant = (tabela, pred = () => true) => db.onde(tabela, (r) => r.tenantId === sessao.tenantId && pred(r));
  const umDoTenant = (tabela, pred) => db.um(tabela, (r) => r.tenantId === sessao.tenantId && pred(r));
  function porId(tabela, id) {
    const r = db.porId(tabela, id);
    if (!r || r.tenantId !== sessao.tenantId) throw new ErroApi(404, 'Registro não encontrado.');
    return r;
  }

  async function auditar(acao, entidade, entidadeId = null, dadosDepois = null, { tenantId = sessao?.tenantId, atorTipo = 'USUARIO' } = {}) {
    const doTenantLog = db.onde('logAuditoria', (l) => l.tenantId === tenantId);
    const anterior = doTenantLog[doTenantLog.length - 1];
    const linha = {
      id: db.todos('logAuditoria').length + 1,
      tenantId,
      atorTipo,
      usuarioId: sessao?.usuarioId ?? null,
      usuarioNome: sessao?.nome ?? null,
      portal,
      acao,
      entidade,
      entidadeId,
      dadosDepois,
      criadoEm: iso(),
      hashAnterior: anterior?.hash ?? null,
    };
    linha.hash = await sha256(jsonCanonico(linha));
    db.inserir('logAuditoria', linha);
  }

  // ---- Helpers de domínio ------------------------------------------------------

  const tenantAtual = () => db.porId('tenants', sessao.tenantId);
  const pessoa = (id) => db.porId('pessoas', id);
  const plano = (id) => db.porId('planos', id);
  const item = (id) => db.porId('itensCatalogo', id);
  const estab = (id) => db.porId('estabelecimentos', id);

  function beneficiarioCompleto(b) {
    const a = db.porId('assinaturas', b.assinaturaId);
    const p = pessoa(b.pessoaId);
    return { ...b, pessoa: p, assinatura: a, plano: plano(a.planoId), idade: idade(p.dataNascimento) };
  }

  function contratoResumo(a) {
    const benefs = db.onde('beneficiarios', (b) => b.assinaturaId === a.id);
    const faturas = db.onde('faturas', (f) => f.assinaturaId === a.id);
    return {
      ...a,
      titular: pessoa(a.titularId),
      plano: plano(a.planoId),
      qtdBeneficiarios: benefs.length,
      faturasVencidas: faturas.filter((f) => f.status === 'VENCIDA').length,
      valorEmAberto: soma(faturas.filter((f) => ['VENCIDA', 'ABERTA'].includes(f.status)), 'valorTotal'),
    };
  }

  function usosNoPeriodo(beneficiario, regra, hoje = new Date()) {
    if (!regra?.limiteQuantidade) return 0;
    const desde = inicioPeriodo(regra.periodicidadeLimite, hoje, beneficiario.inicioVigencia);
    return db
      .onde('transacoes', (t) => t.beneficiarioId === beneficiario.id && t.planoBeneficioId === regra.id && t.status === 'CONFIRMADA' && !t.transacaoOriginalId && new Date(t.ocorridaEm) >= desde)
      .reduce((s, t) => s + Number(t.quantidade), 0);
  }

  function simularBeneficio({ beneficiario, estabelecimento, itemCatalogo, quantidade = 1, valorInformado }) {
    const assinatura = db.porId('assinaturas', beneficiario.assinaturaId);
    const regras = db.onde('planoBeneficios', (r) => r.planoId === assinatura.planoId);
    const regra = escolherRegra(regras, itemCatalogo, estabelecimento.natureza);
    const preco = db.um('tabelaPrecos', (p) => p.estabelecimentoId === estabelecimento.id && p.itemCatalogoId === itemCatalogo.id);
    return calcularBeneficio({ regra, item: itemCatalogo, preco, valorInformado, quantidade, beneficiario, usosNoPeriodo: usosNoPeriodo(beneficiario, regra) });
  }

  function proximoNumeroFatura(competencia) {
    const t = tenantAtual();
    const n = doTenant('faturas').length + 1;
    return `${t.prefixo}${isoDia(competencia).slice(0, 7).replace('-', '')}-${String(n).padStart(5, '0')}`;
  }

  function criarFaturaMensal(assinatura, competencia, hoje = new Date()) {
    const comp = inicioMes(competencia);
    if (db.um('faturas', (f) => f.assinaturaId === assinatura.id && f.tipo === 'MENSALIDADE' && f.competencia === isoDia(comp))) return null;
    let vencimento = new Date(Date.UTC(comp.getUTCFullYear(), comp.getUTCMonth(), assinatura.diaVencimento));
    if (vencimento < hoje) vencimento = addDias(hoje, 3);
    return db.inserir('faturas', {
      tenantId: assinatura.tenantId, assinaturaId: assinatura.id, numero: proximoNumeroFatura(comp), tipo: 'MENSALIDADE',
      competencia: isoDia(comp), vencimento: isoDia(vencimento), valorOriginal: assinatura.valorMensalidade, valorDesconto: 0,
      valorJuros: 0, valorMulta: 0, valorTotal: assinatura.valorMensalidade, valorPago: null, status: 'ABERTA', metodoPagamento: null, pagaEm: null,
    });
  }

  function validarPessoaNova({ nome, cpf, dataNascimento }, { exigirCpf }) {
    if (!nome || nome.trim().split(' ').length < 2) throw new ErroApi(422, 'Informe o nome completo.');
    if (!dataNascimento) throw new ErroApi(422, `Informe a data de nascimento de ${nome}.`);
    const c = somenteDigitos(cpf);
    if (exigirCpf || c) {
      if (!cpfValido(c)) throw new ErroApi(422, `CPF inválido para ${nome}.`);
      if (umDoTenant('pessoas', (p) => p.cpf === c)) throw new ErroApi(409, `Já existe cadastro com o CPF de ${nome}.`);
    }
    return c || null;
  }

  function criarContratoInterno({ titular, dependentes = [], planoId, diaVencimento, metodo, canal, status, vendedorEstabelecimentoId = null }) {
    const pl = porId('planos', planoId);
    const cpfTitular = validarPessoaNova(titular, { exigirCpf: true });
    if (pl.idadeMinima && idade(titular.dataNascimento) < pl.idadeMinima) throw new ErroApi(422, `O plano ${pl.nome} exige idade mínima de ${pl.idadeMinima} anos.`);
    if (dependentes.length > (pl.maxDependentes ?? 0)) throw new ErroApi(422, `O plano ${pl.nome} permite até ${pl.maxDependentes} dependente(s).`);
    const cpfsDeps = dependentes.map((d) => validarPessoaNova(d, { exigirCpf: false }));
    const todos = [cpfTitular, ...cpfsDeps].filter(Boolean);
    if (new Set(todos).size !== todos.length) throw new ErroApi(422, 'Há CPFs repetidos entre titular e dependentes.');

    const t = tenantAtual();
    const hoje = new Date();
    const novaPessoa = (dados, cpf) =>
      db.inserir('pessoas', {
        tenantId: t.id, nome: dados.nome.trim(), cpf, dataNascimento: dados.dataNascimento, sexo: dados.sexo || 'NAO_INFORMADO',
        email: dados.email || null, celular: somenteDigitos(dados.celular) || null, bairro: dados.bairro || null, cidade: t.cidade, uf: 'CE',
        latitude: -3.7319 + (Math.random() - 0.5) * 0.1, longitude: -38.5267 + (Math.random() - 0.5) * 0.1,
      });
    const pTitular = novaPessoa(titular, cpfTitular);
    const pDeps = dependentes.map((d, i) => ({ pessoa: novaPessoa(d, cpfsDeps[i]), parentesco: d.parentesco || 'OUTRO' }));

    const extras = Math.max(0, pDeps.length - pl.dependentesInclusos);
    const seq = doTenant('assinaturas').length + 1;
    const assinatura = db.inserir('assinaturas', {
      tenantId: t.id, numeroContrato: `${t.prefixo}-${String(seq).padStart(6, '0')}`, planoId: pl.id, titularId: pTitular.id,
      responsavelFinanceiroId: null, status, canalVenda: canal, vendedorEstabelecimentoId,
      valorMensalidade: centavos(Number(pl.valorMensalidade) + extras * Number(pl.valorDependenteAdicional ?? 0)),
      diaVencimento: Number(diaVencimento) || 10, metodoPagamentoPreferido: metodo || 'PIX', gateway: 'SIMULADO',
      inicioVigencia: isoDia(hoje), suspensaEm: null, canceladaEm: null,
    });
    const carenciaAte = pl.carenciaPadraoDias ? isoDia(addDias(hoje, pl.carenciaPadraoDias)) : null;
    const benefs = [{ pessoa: pTitular, parentesco: null }, ...pDeps].map(({ pessoa: p, parentesco }, i) =>
      db.inserir('beneficiarios', {
        tenantId: t.id, assinaturaId: assinatura.id, pessoaId: p.id, tipo: i === 0 ? 'TITULAR' : 'DEPENDENTE', parentesco,
        numeroCarteirinha: `${t.prefixo}${String(seq).padStart(6, '0')}-${String(i).padStart(2, '0')}`,
        status: 'ATIVO', inicioVigencia: isoDia(hoje), carenciaAte, segredoQr: base32Aleatorio(20), versaoCarteirinha: 1,
      }),
    );
    for (const finalidade of ['TERMOS_USO', 'POLITICA_PRIVACIDADE', 'TRATAMENTO_DADOS_SAUDE'])
      db.inserir('consentimentos', { tenantId: t.id, pessoaId: pTitular.id, finalidade, concedido: true, versaoTermo: '2025.1', canal: canal === 'APP' ? 'APP' : 'RECEPCAO', registradoEm: iso(), revogadoEm: null });
    if (status === 'ATIVA') criarFaturaMensal(assinatura, hoje);
    return { assinatura, beneficiarios: benefs };
  }

  function adicionarDependenteInterno(assinatura, dados) {
    const pl = plano(assinatura.planoId);
    const atuais = db.onde('beneficiarios', (b) => b.assinaturaId === assinatura.id && b.tipo === 'DEPENDENTE' && b.status !== 'CANCELADO');
    if (atuais.length >= (pl.maxDependentes ?? 0)) throw new ErroApi(422, `Limite de ${pl.maxDependentes} dependente(s) do plano ${pl.nome} atingido.`);
    const cpf = validarPessoaNova(dados, { exigirCpf: false });
    const t = tenantAtual();
    const titular = pessoa(assinatura.titularId);
    const p = db.inserir('pessoas', {
      tenantId: t.id, nome: dados.nome.trim(), cpf, dataNascimento: dados.dataNascimento, sexo: dados.sexo || 'NAO_INFORMADO',
      cidade: titular.cidade, uf: titular.uf, bairro: titular.bairro, latitude: titular.latitude, longitude: titular.longitude,
    });
    const todos = db.onde('beneficiarios', (b) => b.assinaturaId === assinatura.id);
    const base = todos[0].numeroCarteirinha.split('-')[0];
    const b = db.inserir('beneficiarios', {
      tenantId: t.id, assinaturaId: assinatura.id, pessoaId: p.id, tipo: 'DEPENDENTE', parentesco: dados.parentesco || 'OUTRO',
      numeroCarteirinha: `${base}-${String(todos.length).padStart(2, '0')}`, status: assinatura.status === 'SUSPENSA' ? 'SUSPENSO' : 'ATIVO',
      inicioVigencia: isoDia(new Date()), carenciaAte: pl.carenciaPadraoDias ? isoDia(addDias(new Date(), pl.carenciaPadraoDias)) : null,
      segredoQr: base32Aleatorio(20), versaoCarteirinha: 1,
    });
    if (atuais.length + 1 > pl.dependentesInclusos) {
      db.atualizar('assinaturas', assinatura.id, { valorMensalidade: centavos(Number(assinatura.valorMensalidade) + Number(pl.valorDependenteAdicional ?? 0)) });
    }
    return b;
  }

  // ---- Cobrança simulada --------------------------------------------------------

  function emitirCobrancaInterna(faturaId, metodo) {
    const fatura = porId('faturas', faturaId);
    if (!['ABERTA', 'VENCIDA'].includes(fatura.status)) throw new ErroApi(422, 'Esta fatura não está em aberto.');
    if (!['PIX', 'BOLETO', 'CARTAO_CREDITO'].includes(metodo)) throw new ErroApi(422, 'Método de pagamento inválido.');
    const agora = new Date();

    const existente = db.um('cobrancas', (c) => c.faturaId === fatura.id && c.metodo === metodo && c.status === 'PENDENTE' && (!c.pixExpiraEm || new Date(c.pixExpiraEm) > agora));
    if (existente) return existente;

    if (fatura.status === 'VENCIDA') {
      const dias = Math.max(1, diasEntre(fatura.vencimento, agora));
      const valorMulta = centavos(Number(fatura.valorOriginal) * 0.02);
      const valorJuros = centavos(Number(fatura.valorOriginal) * 0.00033 * dias);
      db.atualizar('faturas', fatura.id, { valorMulta, valorJuros, valorTotal: centavos(Number(fatura.valorOriginal) - Number(fatura.valorDesconto) + valorMulta + valorJuros) });
    }

    const t = tenantAtual();
    const gatewayCobrancaId = `sim_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const base = { tenantId: t.id, faturaId: fatura.id, gateway: 'SIMULADO', metodo, gatewayCobrancaId, status: 'PENDENTE', valor: fatura.valorTotal };
    let dados = {};
    if (metodo === 'PIX') {
      const txid = `SIMULACAO${fatura.numero.replace(/\D/g, '')}${Date.now().toString().slice(-4)}`;
      dados = {
        pixTxid: txid,
        pixCopiaECola: gerarPixSimulado({ valor: fatura.valorTotal, txid, recebedor: t.nomeFantasia, cidade: t.cidade }),
        pixExpiraEm: iso(new Date(agora.getTime() + VALIDADE_PIX_MIN * 60_000)),
      };
    } else if (metodo === 'BOLETO') {
      const venc = new Date(fatura.vencimento) < agora ? addDias(agora, 2) : new Date(fatura.vencimento);
      const nossoNumero = `${fatura.numero.replace(/\D/g, '')}${String(Date.now()).slice(-6)}`;
      dados = { ...gerarBoletoSimulado({ valor: fatura.valorTotal, vencimento: isoDia(venc), nossoNumero }), boletoVencimento: isoDia(venc) };
      dados.boletoLinhaDigitavel = dados.linhaDigitavel;
      dados.boletoCodigoBarras = dados.codigoBarras;
      delete dados.linhaDigitavel;
      delete dados.codigoBarras;
    } else {
      dados = { linkPagamento: `https://pagamento.simulado.invalid/${gatewayCobrancaId}` };
    }
    return db.inserir('cobrancas', { ...base, ...dados });
  }

  /** Simula o webhook de confirmação do gateway. */
  async function confirmarPagamentoInterno(cobrancaId) {
    const cobranca = porId('cobrancas', cobrancaId);
    if (cobranca.status !== 'PENDENTE') throw new ErroApi(422, 'Esta cobrança não está pendente.');
    if (cobranca.pixExpiraEm && new Date(cobranca.pixExpiraEm) < new Date()) throw new ErroApi(422, 'Pix expirado. Gere um novo código.');
    const fatura = porId('faturas', cobranca.faturaId);
    const taxa = { PIX: Number(cobranca.valor) * 0.0099, BOLETO: 1.99, CARTAO_CREDITO: Number(cobranca.valor) * 0.0299 }[cobranca.metodo];
    db.atualizar('cobrancas', cobranca.id, { status: 'RECEBIDA', pagaEm: iso(), taxaGateway: centavos(taxa), valorLiquido: centavos(Number(cobranca.valor) - taxa) });
    db.onde('cobrancas', (c) => c.faturaId === fatura.id && c.id !== cobranca.id && c.status === 'PENDENTE').forEach((c) => db.atualizar('cobrancas', c.id, { status: 'CANCELADA' }));
    db.atualizar('faturas', fatura.id, { status: 'PAGA', valorPago: cobranca.valor, pagaEm: iso(), metodoPagamento: cobranca.metodo });

    const assinatura = db.porId('assinaturas', fatura.assinaturaId);
    let reativada = false;
    const restamVencidas = db.onde('faturas', (f) => f.assinaturaId === assinatura.id && f.status === 'VENCIDA').length;
    if (['INADIMPLENTE', 'SUSPENSA'].includes(assinatura.status) && !restamVencidas) {
      db.atualizar('assinaturas', assinatura.id, { status: 'ATIVA', suspensaEm: null });
      db.onde('beneficiarios', (b) => b.assinaturaId === assinatura.id && b.status === 'SUSPENSO').forEach((b) => db.atualizar('beneficiarios', b.id, { status: 'ATIVO' }));
      reativada = true;
    }
    const titular = pessoa(assinatura.titularId);
    db.inserir('notificacoes', {
      tenantId: assinatura.tenantId, canal: 'WHATSAPP', pessoaId: titular.id, destino: titular.celular ? `+55${titular.celular}` : '—', status: 'ENVIADA', faturaId: fatura.id,
      conteudo: `Pagamento de ${Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} confirmado (simulação).${reativada ? ' Seus benefícios foram reativados.' : ''}`,
      enviadaEm: iso(),
    });
    await auditar('PAGAMENTO_CONFIRMADO', 'faturas', fatura.id, { cobranca: cobranca.gatewayCobrancaId, metodo: cobranca.metodo, valor: cobranca.valor, simulado: true }, { atorTipo: 'WEBHOOK' });
    return { fatura: db.porId('faturas', fatura.id), reativada };
  }

  function horariosLivres({ profissionalId, estabelecimentoId, dias = 10 }) {
    const grades = db.onde('gradesAgenda', (g) => g.profissionalId === profissionalId && g.estabelecimentoId === estabelecimentoId && g.permiteAgendamentoOnline);
    const ocupados = new Set(db.onde('agendamentos', (a) => a.profissionalId === profissionalId && a.status !== 'CANCELADO').map((a) => a.inicio));
    const agora = new Date();
    const resultado = [];
    for (let d = 0; d < dias; d++) {
      const dia = addDias(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())), d);
      const slots = [];
      for (const g of grades.filter((x) => x.diaSemana === dia.getUTCDay())) {
        const [h0, m0] = g.horaInicio.split(':').map(Number);
        const [h1, m1] = g.horaFim.split(':').map(Number);
        for (let min = h0 * 60 + m0; min + g.duracaoMinutos <= h1 * 60 + m1; min += g.duracaoMinutos) {
          const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 3, min)); // UTC-3
          if (inicio > addDias(agora, 0) && inicio.getTime() > agora.getTime() + 2 * 3600_000 && !ocupados.has(inicio.toISOString()))
            slots.push({ inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + g.duracaoMinutos * 60_000).toISOString(), especialidadeId: g.especialidadeId });
        }
      }
      if (slots.length) resultado.push({ dia: isoDia(dia), slots });
    }
    return resultado;
  }

  function criarAgendamentoInterno({ beneficiario, profissionalId, estabelecimentoId, inicio, origem }) {
    const elig = avaliarElegibilidade({ beneficiario, assinatura: db.porId('assinaturas', beneficiario.assinaturaId) });
    if (!['ELEGIVEL', 'EM_CARENCIA'].includes(elig.resultado)) throw new ErroApi(422, `Não é possível agendar: ${elig.motivo}`);
    const livre = horariosLivres({ profissionalId, estabelecimentoId, dias: 30 }).some((d) => d.slots.some((s) => s.inicio === inicio));
    if (!livre) throw new ErroApi(409, 'Horário indisponível. Escolha outro.');
    const slot = horariosLivres({ profissionalId, estabelecimentoId, dias: 30 }).flatMap((d) => d.slots).find((s) => s.inicio === inicio);
    const it = umDoTenant('itensCatalogo', (i) => i.especialidadeId === slot.especialidadeId);
    const ag = db.inserir('agendamentos', {
      tenantId: sessao.tenantId, pessoaId: beneficiario.pessoaId, beneficiarioId: beneficiario.id, estabelecimentoId, profissionalId,
      especialidadeId: slot.especialidadeId, itemCatalogoId: it?.id ?? null, tipo: it?.categoria === 'ODONTOLOGIA' ? 'ODONTOLOGIA' : 'CONSULTA',
      inicio, fim: slot.fim, status: 'AGENDADO', origem,
    });
    const titular = pessoa(db.porId('assinaturas', beneficiario.assinaturaId).titularId);
    const pr = db.porId('profissionais', profissionalId);
    db.inserir('notificacoes', {
      tenantId: sessao.tenantId, canal: 'WHATSAPP', pessoaId: titular.id, destino: titular.celular ? `+55${titular.celular}` : '—', status: 'ENVIADA', agendamentoId: ag.id,
      conteudo: `Agendamento registrado: ${pr.nomeExibicao}, ${new Date(inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} em ${estab(estabelecimentoId).nome}. Responda 1 para confirmar.`,
      enviadaEm: iso(),
    });
    return ag;
  }

  function agendamentoCompleto(a) {
    return { ...a, pessoa: pessoa(a.pessoaId), profissional: a.profissionalId ? db.porId('profissionais', a.profissionalId) : null, estabelecimento: estab(a.estabelecimentoId), especialidade: a.especialidadeId ? db.porId('especialidades', a.especialidadeId) : null, beneficiario: a.beneficiarioId ? db.porId('beneficiarios', a.beneficiarioId) : null };
  }

  const transacaoCompleta = (t) => ({ ...t, pessoa: pessoa(t.pessoaId), estabelecimento: estab(t.estabelecimentoId), profissional: t.profissionalId ? db.porId('profissionais', t.profissionalId) : null, beneficiario: db.porId('beneficiarios', t.beneficiarioId) });

  // ===========================================================================
  // API pública
  // ===========================================================================
  return {
    portal,
    sessao: () => (sessao = lerSessao()),
    branding: () => (sessao ? brandingDoTenant(sessao.tenantId) : null),
    tenant: () => (sessao ? db.porId('tenants', sessao.tenantId) : null),
    pode: (permissao) => !!sessao && temPermissao(sessao.permissoes, permissao),

    // ---- Autenticação --------------------------------------------------------
    auth: {
      async login({ tenantSlug, email, senha }) {
        await latencia();
        const tenant = db.um('tenants', (t) => t.slug === tenantSlug);
        if (!tenant) throw new ErroApi(404, 'Organização não encontrada.');
        const usuario = db.um('usuarios', (u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
        const ok = usuario && usuario.ativo && usuario.senhaHash === (await hashSenha(senha, usuario.sal));
        const membro = ok ? db.um('membros', (m) => m.usuarioId === usuario.id && m.tenantId === tenant.id) : null;
        if (!ok || !membro) {
          sessao = null;
          await auditar('LOGIN_FALHOU', 'usuarios', null, { email, portal }, { tenantId: tenant.id });
          throw new ErroApi(401, 'E-mail ou senha incorretos.');
        }
        if (membro.status === 'PENDENTE_APROVACAO') throw new ErroApi(403, 'Cadastro aguardando aprovação do hospital.');
        if (membro.status !== 'ATIVO') throw new ErroApi(403, 'Acesso bloqueado. Procure o administrador.');
        const codigos = membro.papeis.map((p) => p.codigo);
        if (!codigos.some((c) => PAPEIS[c]?.portal === portal)) throw new ErroApi(403, 'Este usuário não tem acesso a este portal.');
        sessao = {
          usuarioId: usuario.id, nome: usuario.nome, email: usuario.email, tenantId: tenant.id, tenantSlug: tenant.slug,
          membroId: membro.id, papeis: codigos, permissoes: permissoesDe(codigos),
          estabelecimentoId: membro.papeis.find((p) => p.estabelecimentoId)?.estabelecimentoId ?? null,
          profissionalId: membro.profissionalId, pessoaId: membro.pessoaId, exp: Date.now() + DURACAO_SESSAO_MS,
        };
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
        db.atualizar('usuarios', usuario.id, { ultimoAcessoEm: iso() });
        await auditar('LOGIN', 'usuarios', usuario.id, { portal });
        return sessao;
      },

      async logout() {
        if (sessao) await auditar('LOGOUT', 'usuarios', sessao.usuarioId);
        sessao = null;
        localStorage.removeItem(CHAVE_SESSAO);
      },

      /** Portal do parceiro: solicitação de credenciamento (fica EM_ANALISE / PENDENTE_APROVACAO). */
      async solicitarCredenciamento({ tenantSlug, estabelecimento: e, responsavel }) {
        await latencia();
        const tenant = db.um('tenants', (t) => t.slug === tenantSlug);
        if (!tenant) throw new ErroApi(404, 'Organização não encontrada.');
        const documento = somenteDigitos(e.documento);
        if (![11, 14].includes(documento.length)) throw new ErroApi(422, 'Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).');
        if (db.um('estabelecimentos', (x) => x.tenantId === tenant.id && x.documento === documento)) throw new ErroApi(409, 'Já existe um credenciamento com este documento.');
        if (!e.nome?.trim()) throw new ErroApi(422, 'Informe o nome do estabelecimento.');
        if (!responsavel.nome?.trim() || !/^\S+@\S+\.\S+$/.test(responsavel.email ?? '')) throw new ErroApi(422, 'Informe nome e e-mail válidos do responsável.');
        if ((responsavel.senha ?? '').length < 6) throw new ErroApi(422, 'A senha deve ter pelo menos 6 caracteres.');
        if (db.um('usuarios', (u) => u.email.toLowerCase() === responsavel.email.toLowerCase())) throw new ErroApi(409, 'Este e-mail já possui cadastro.');

        const novo = db.inserir('estabelecimentos', {
          tenantId: tenant.id, natureza: 'CREDENCIADO', tipo: e.tipo, matrizId: null, nome: e.nome.trim(), razaoSocial: e.razaoSocial || null, documento,
          status: 'EM_ANALISE', telefone: somenteDigitos(e.telefone), whatsapp: somenteDigitos(e.telefone), email: e.email || responsavel.email,
          logradouro: e.logradouro || null, numero: e.numero || null, bairro: e.bairro || null, cidade: tenant.cidade, uf: 'CE',
          latitude: -3.7319 + (Math.random() - 0.5) * 0.1, longitude: -38.5267 + (Math.random() - 0.5) * 0.1,
          horarioFuncionamento: e.horario || null, aceitaAgendamentoOnline: false, totalAvaliacoes: 0, notaMedia: null,
          especialidadesInformadas: e.especialidades || null,
        });
        const sal = base32Aleatorio(8);
        const usuario = db.inserir('usuarios', { email: responsavel.email.trim().toLowerCase(), nome: responsavel.nome.trim(), sal, senhaHash: await hashSenha(responsavel.senha, sal), ativo: true });
        db.atualizar('usuarios', usuario.id, { authUserId: usuario.id });
        db.inserir('membros', { tenantId: tenant.id, usuarioId: usuario.id, status: 'PENDENTE_APROVACAO', papeis: [{ codigo: 'PARCEIRO_GESTOR', estabelecimentoId: novo.id }], profissionalId: null, pessoaId: null });
        await auditar('CRIAR', 'estabelecimentos', novo.id, { nome: novo.nome, origem: 'autocadastro' }, { tenantId: tenant.id, atorTipo: 'USUARIO' });
        return novo;
      },

      /** App: primeiro acesso do associado (CPF + nascimento precisam bater com o contrato). */
      async primeiroAcesso({ tenantSlug, cpf, dataNascimento, email, senha }) {
        await latencia();
        const tenant = db.um('tenants', (t) => t.slug === tenantSlug);
        if (!tenant) throw new ErroApi(404, 'Organização não encontrada.');
        const c = somenteDigitos(cpf);
        const p = db.um('pessoas', (x) => x.tenantId === tenant.id && x.cpf === c && x.dataNascimento === dataNascimento);
        const benef = p && db.um('beneficiarios', (b) => b.pessoaId === p.id && b.status !== 'CANCELADO');
        if (!benef) throw new ErroApi(404, 'Não encontramos um contrato ativo com estes dados.');
        if (idade(p.dataNascimento) < 18) throw new ErroApi(422, 'Menores de idade acessam pela conta do titular.');
        if (db.um('membros', (m) => m.tenantId === tenant.id && m.pessoaId === p.id)) throw new ErroApi(409, 'Este associado já possui acesso. Use "Entrar".');
        if (!/^\S+@\S+\.\S+$/.test(email ?? '')) throw new ErroApi(422, 'Informe um e-mail válido.');
        if ((senha ?? '').length < 6) throw new ErroApi(422, 'A senha deve ter pelo menos 6 caracteres.');
        let usuario = db.um('usuarios', (u) => u.email.toLowerCase() === email.toLowerCase());
        if (usuario) throw new ErroApi(409, 'Este e-mail já está em uso.');
        const sal = base32Aleatorio(8);
        usuario = db.inserir('usuarios', { email: email.trim().toLowerCase(), nome: p.nome, sal, senhaHash: await hashSenha(senha, sal), ativo: true });
        db.atualizar('usuarios', usuario.id, { authUserId: usuario.id });
        db.inserir('membros', { tenantId: tenant.id, usuarioId: usuario.id, status: 'ATIVO', papeis: [{ codigo: 'ASSOCIADO', estabelecimentoId: null }], pessoaId: p.id, profissionalId: null, aprovadoEm: iso() });
        await auditar('CRIAR', 'membros', usuario.id, { origem: 'primeiro_acesso_app' }, { tenantId: tenant.id });
        return this.login({ tenantSlug, email, senha });
      },
    },

    // ======================================================================
    // PAINEL ADMIN DO HOSPITAL
    // ======================================================================
    admin: {
      async dashboard() {
        exigir('dashboard.ver');
        await latencia();
        const hoje = new Date();
        const mesAtual = inicioMes(hoje);
        const assinaturas = doTenant('assinaturas');
        const conta = (s) => assinaturas.filter((a) => a.status === s).length;
        const faturas = doTenant('faturas');
        const transacoes = doTenant('transacoes', (t) => t.status === 'CONFIRMADA');

        const meses = Array.from({ length: 6 }, (_, i) => addMeses(mesAtual, i - 5));
        const receitaMensal = meses.map((m) => {
          const fim = addMeses(m, 1);
          const pagas = faturas.filter((f) => f.pagaEm && new Date(f.pagaEm) >= m && new Date(f.pagaEm) < fim);
          const previstas = faturas.filter((f) => f.competencia === isoDia(m) && f.status !== 'CANCELADA');
          const usos = transacoes.filter((t) => new Date(t.ocorridaEm) >= m && new Date(t.ocorridaEm) < fim);
          return { mes: isoDia(m), recebido: soma(pagas, 'valorPago'), previsto: soma(previstas, 'valorTotal'), economia: soma(usos, 'valorDesconto'), taxas: soma(usos, 'valorTaxaMatriz') };
        });

        const venceram = faturas.filter((f) => new Date(f.vencimento) < hoje && new Date(f.vencimento) >= addDias(hoje, -60) && f.status !== 'CANCELADA');
        const adimplencia = venceram.length ? venceram.filter((f) => f.status === 'PAGA').length / venceram.length : 1;
        const ativasInicioMes = assinaturas.filter((a) => new Date(a.inicioVigencia) < mesAtual && (!a.canceladaEm || new Date(a.canceladaEm) >= mesAtual)).length;
        const canceladasMes = assinaturas.filter((a) => a.canceladaEm && new Date(a.canceladaEm) >= mesAtual).length;
        const ultimos90 = transacoes.filter((t) => new Date(t.ocorridaEm) >= addDias(hoje, -90) && !t.transacaoOriginalId);

        const agrupar = (lista, chave, rotulo) => {
          const mapa = new Map();
          for (const t of lista) {
            const k = chave(t);
            const atual = mapa.get(k) ?? { rotulo: rotulo(t), usos: 0, economia: 0 };
            atual.usos += 1;
            atual.economia = centavos(atual.economia + Number(t.valorDesconto));
            mapa.set(k, atual);
          }
          return [...mapa.values()].sort((a, b) => b.usos - a.usos);
        };

        const porPlano = doTenant('planos').map((p) => ({ plano: p.nome, cor: p.corDestaque, ativos: assinaturas.filter((a) => a.planoId === p.id && ['ATIVA', 'INADIMPLENTE'].includes(a.status)).length }));
        const beneficiariosAtivos = doTenant('beneficiarios', (b) => b.status === 'ATIVO' && ['ATIVA', 'INADIMPLENTE'].includes(db.porId('assinaturas', b.assinaturaId).status)).length;

        return {
          kpis: {
            contratosAtivos: conta('ATIVA'), inadimplentes: conta('INADIMPLENTE'), suspensos: conta('SUSPENSA'), pendentes: conta('PENDENTE_ATIVACAO'),
            beneficiariosAtivos, mrr: soma(assinaturas.filter((a) => ['ATIVA', 'INADIMPLENTE'].includes(a.status)), 'valorMensalidade'),
            adimplencia, churnMes: ativasInicioMes ? canceladasMes / ativasInicioMes : 0, canceladasMes,
            novasVendasMes: assinaturas.filter((a) => new Date(a.inicioVigencia) >= mesAtual).length,
            emAberto: soma(faturas.filter((f) => f.status === 'VENCIDA'), 'valorTotal'),
            economiaMes: receitaMensal[5].economia, usosMes: transacoes.filter((t) => new Date(t.ocorridaEm) >= mesAtual && !t.transacaoOriginalId).length,
          },
          receitaMensal,
          topServicos: agrupar(ultimos90, (t) => t.descricaoItem, (t) => t.descricaoItem).slice(0, 6),
          rankingParceiros: agrupar(ultimos90, (t) => t.estabelecimentoId, (t) => estab(t.estabelecimentoId).nome).slice(0, 6),
          rankingProfissionais: agrupar(ultimos90.filter((t) => t.profissionalId), (t) => t.profissionalId, (t) => db.porId('profissionais', t.profissionalId).nomeExibicao).slice(0, 5),
          porPlano,
          pendencias: {
            credenciamentos: doTenant('estabelecimentos', (e) => e.status === 'EM_ANALISE').length,
            acessos: doTenant('membros', (m) => m.status === 'PENDENTE_APROVACAO').length,
            adesoes: conta('PENDENTE_ATIVACAO'),
          },
        };
      },

      // ---- Beneficiários / contratos ----
      async contratos({ busca = '', status = '', planoId = '' } = {}) {
        exigir('beneficiarios.ler');
        await latencia();
        const termo = busca.trim().toLowerCase();
        const digitos = somenteDigitos(busca);
        return doTenant('assinaturas', (a) => (!status || a.status === status) && (!planoId || a.planoId === planoId))
          .map(contratoResumo)
          .filter((c) => {
            if (!termo) return true;
            const benefs = db.onde('beneficiarios', (b) => b.assinaturaId === c.id);
            return (
              c.titular.nome.toLowerCase().includes(termo) ||
              c.numeroContrato.toLowerCase().includes(termo) ||
              (digitos.length >= 3 && c.titular.cpf?.includes(digitos)) ||
              benefs.some((b) => b.numeroCarteirinha.toLowerCase().includes(termo) || pessoa(b.pessoaId).nome.toLowerCase().includes(termo))
            );
          })
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      },

      async contrato(assinaturaId) {
        exigir('beneficiarios.ler');
        await latencia();
        const a = porId('assinaturas', assinaturaId);
        const benefs = db.onde('beneficiarios', (b) => b.assinaturaId === a.id).map(beneficiarioCompleto);
        const idsBenef = new Set(benefs.map((b) => b.id));
        return {
          ...contratoResumo(a),
          responsavelVenda: a.vendedorEstabelecimentoId ? estab(a.vendedorEstabelecimentoId)?.nome : null,
          beneficiarios: benefs.map((b) => ({ ...b, elegibilidade: avaliarElegibilidade({ beneficiario: b, assinatura: a }) })),
          faturas: db.onde('faturas', (f) => f.assinaturaId === a.id).sort((x, y) => y.vencimento.localeCompare(x.vencimento)).map((f) => ({ ...f, cobrancas: db.onde('cobrancas', (c) => c.faturaId === f.id) })),
          transacoes: doTenant('transacoes', (t) => idsBenef.has(t.beneficiarioId)).sort((x, y) => y.ocorridaEm.localeCompare(x.ocorridaEm)).slice(0, 30).map(transacaoCompleta),
          agendamentos: doTenant('agendamentos', (g) => idsBenef.has(g.beneficiarioId)).sort((x, y) => y.inicio.localeCompare(x.inicio)).slice(0, 15).map(agendamentoCompleto),
        };
      },

      async criarAdesao(dados) {
        exigir('beneficiarios.gerenciar');
        await latencia();
        const r = criarContratoInterno({ ...dados, status: 'ATIVA', canal: dados.canal || 'RECEPCAO' });
        await auditar('CRIAR', 'assinaturas', r.assinatura.id, { numeroContrato: r.assinatura.numeroContrato, planoId: r.assinatura.planoId, beneficiarios: r.beneficiarios.length });
        return r.assinatura;
      },

      async adicionarDependente(assinaturaId, dados) {
        exigir('beneficiarios.gerenciar');
        await latencia();
        const b = adicionarDependenteInterno(porId('assinaturas', assinaturaId), dados);
        await auditar('CRIAR', 'beneficiarios', b.id, { assinaturaId, tipo: 'DEPENDENTE' });
        return b;
      },

      async alterarStatusContrato(assinaturaId, acao, motivo = '') {
        exigir('beneficiarios.gerenciar');
        await latencia();
        const a = porId('assinaturas', assinaturaId);
        const benefs = db.onde('beneficiarios', (b) => b.assinaturaId === a.id);
        const statusBenef = (s) => benefs.filter((b) => b.status !== 'CANCELADO').forEach((b) => db.atualizar('beneficiarios', b.id, { status: s }));
        const transicoes = {
          ATIVAR: ['PENDENTE_ATIVACAO'],
          SUSPENDER: ['ATIVA', 'INADIMPLENTE'],
          REATIVAR: ['SUSPENSA', 'INADIMPLENTE'],
          CANCELAR: ['PENDENTE_ATIVACAO', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA'],
        };
        if (!transicoes[acao]?.includes(a.status)) throw new ErroApi(422, `Não é possível ${acao.toLowerCase()} um contrato ${a.status.toLowerCase().replace('_', ' ')}.`);
        if (acao === 'ATIVAR') {
          db.atualizar('assinaturas', a.id, { status: 'ATIVA', inicioVigencia: isoDia(new Date()) });
          criarFaturaMensal(db.porId('assinaturas', a.id), new Date());
        }
        if (acao === 'SUSPENDER') {
          db.atualizar('assinaturas', a.id, { status: 'SUSPENSA', suspensaEm: iso() });
          statusBenef('SUSPENSO');
        }
        if (acao === 'REATIVAR') {
          db.atualizar('assinaturas', a.id, { status: 'ATIVA', suspensaEm: null });
          statusBenef('ATIVO');
        }
        if (acao === 'CANCELAR') {
          db.atualizar('assinaturas', a.id, { status: 'CANCELADA', canceladaEm: iso(), motivoCancelamento: motivo || 'Cancelado pelo hospital' });
          statusBenef('CANCELADO');
          db.onde('faturas', (f) => f.assinaturaId === a.id && f.status === 'ABERTA').forEach((f) => db.atualizar('faturas', f.id, { status: 'CANCELADA', canceladaEm: iso(), motivoCancelamento: 'Contrato cancelado' }));
        }
        await auditar('ATUALIZAR', 'assinaturas', a.id, { acao, motivo, statusAnterior: a.status });
        return db.porId('assinaturas', a.id);
      },

      async reemitirCarteirinha(beneficiarioId) {
        exigir('beneficiarios.gerenciar');
        const b = porId('beneficiarios', beneficiarioId);
        db.atualizar('beneficiarios', b.id, { segredoQr: base32Aleatorio(20), versaoCarteirinha: b.versaoCarteirinha + 1 });
        await auditar('ATUALIZAR', 'beneficiarios', b.id, { acao: 'REEMITIR_CARTEIRINHA', versao: b.versaoCarteirinha + 1 });
      },

      // ---- Planos ----
      async planos() {
        exigir('planos.ler');
        await latencia();
        return doTenant('planos')
          .sort((a, b) => a.nivel - b.nivel || a.valorMensalidade - b.valorMensalidade)
          .map((p) => ({
            ...p,
            assinantes: doTenant('assinaturas', (a) => a.planoId === p.id && ['ATIVA', 'INADIMPLENTE'].includes(a.status)).length,
            regras: db.onde('planoBeneficios', (r) => r.planoId === p.id && r.ativo).map((r) => ({ ...r, item: r.itemCatalogoId ? item(r.itemCatalogoId) : null })),
          }));
      },

      async salvarPlano(dados) {
        exigir('planos.gerenciar');
        await latencia();
        if (!dados.nome?.trim()) throw new ErroApi(422, 'Informe o nome do plano.');
        const campos = {
          nome: dados.nome.trim(), codigo: (dados.codigo || dados.nome).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '_'), descricao: dados.descricao || '',
          valorMensalidade: Number(dados.valorMensalidade), valorDependenteAdicional: Number(dados.valorDependenteAdicional || 0),
          dependentesInclusos: Number(dados.dependentesInclusos || 0), maxDependentes: Number(dados.maxDependentes || 0),
          carenciaPadraoDias: Number(dados.carenciaPadraoDias || 0), idadeMinima: dados.idadeMinima ? Number(dados.idadeMinima) : null,
          nivel: Number(dados.nivel || 1), corDestaque: dados.corDestaque || '#0F766E', publicado: !!dados.publicado, ativo: dados.ativo !== false,
        };
        if (!(campos.valorMensalidade > 0)) throw new ErroApi(422, 'Informe o valor da mensalidade.');
        if (campos.maxDependentes < campos.dependentesInclusos) throw new ErroApi(422, 'Máximo de dependentes não pode ser menor que os inclusos.');
        let p;
        if (dados.id) {
          porId('planos', dados.id);
          p = db.atualizar('planos', dados.id, campos);
        } else {
          if (umDoTenant('planos', (x) => x.codigo === campos.codigo)) throw new ErroApi(409, 'Já existe um plano com este código.');
          p = db.inserir('planos', { tenantId: sessao.tenantId, valorAdesao: 0, fidelidadeMeses: 0, ...campos });
        }
        await auditar(dados.id ? 'ATUALIZAR' : 'CRIAR', 'planos', p.id, campos);
        return p;
      },

      async salvarRegra(dados) {
        exigir('planos.gerenciar');
        porId('planos', dados.planoId);
        if (!dados.itemCatalogoId && !dados.categoria) throw new ErroApi(422, 'Escolha uma categoria ou um item.');
        const percentual = ['DESCONTO_PERCENTUAL', 'COPARTICIPACAO_PERCENTUAL'].includes(dados.tipoRegra);
        if (percentual && !(Number(dados.valor) >= 0 && Number(dados.valor) <= 100)) throw new ErroApi(422, 'Percentual deve estar entre 0 e 100.');
        const campos = {
          planoId: dados.planoId, itemCatalogoId: dados.itemCatalogoId || null, categoria: dados.itemCatalogoId ? null : dados.categoria,
          tipoRegra: dados.tipoRegra, valor: Number(dados.valor || 0), carenciaDias: dados.carenciaDias ? Number(dados.carenciaDias) : null,
          limiteQuantidade: dados.limiteQuantidade ? Number(dados.limiteQuantidade) : null, periodicidadeLimite: dados.limiteQuantidade ? dados.periodicidadeLimite || 'MES' : null,
          abrangencia: dados.abrangencia || 'TODAS', aplicaDependentes: dados.aplicaDependentes !== false, prioridade: dados.itemCatalogoId ? 10 : 0, ativo: true,
        };
        const r = dados.id ? db.atualizar('planoBeneficios', porId('planoBeneficios', dados.id).id, campos) : db.inserir('planoBeneficios', { tenantId: sessao.tenantId, ...campos });
        await auditar(dados.id ? 'ATUALIZAR' : 'CRIAR', 'planoBeneficios', r.id, campos);
        return r;
      },

      async removerRegra(id) {
        exigir('planos.gerenciar');
        db.atualizar('planoBeneficios', porId('planoBeneficios', id).id, { ativo: false });
        await auditar('EXCLUIR', 'planoBeneficios', id);
      },

      catalogo() {
        exigir();
        return doTenant('itensCatalogo', (i) => i.ativo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
      },

      // ---- Rede credenciada ----
      async rede() {
        exigir('rede.ler');
        await latencia();
        const desde = addDias(new Date(), -30);
        return doTenant('estabelecimentos')
          .map((e) => {
            const ts = doTenant('transacoes', (t) => t.estabelecimentoId === e.id && t.status === 'CONFIRMADA' && new Date(t.ocorridaEm) >= desde);
            return {
              ...e,
              matriz: e.matrizId ? estab(e.matrizId) : null,
              ofertas: db.onde('tabelaPrecos', (p) => p.estabelecimentoId === e.id).length,
              usos30d: ts.filter((t) => !t.transacaoOriginalId).length,
              economia30d: soma(ts, 'valorDesconto'),
              acessos: doTenant('membros', (m) => m.papeis.some((p) => p.estabelecimentoId === e.id)).map((m) => ({ ...m, usuario: db.porId('usuarios', m.usuarioId) })),
            };
          })
          .sort((a, b) => (a.status === 'EM_ANALISE' ? -1 : 0) - (b.status === 'EM_ANALISE' ? -1 : 0) || a.natureza.localeCompare(b.natureza) || a.nome.localeCompare(b.nome));
      },

      async alterarStatusEstabelecimento(id, status) {
        exigir('rede.gerenciar');
        const e = porId('estabelecimentos', id);
        if (!['ATIVO', 'SUSPENSO', 'DESCREDENCIADO'].includes(status)) throw new ErroApi(422, 'Status inválido.');
        db.atualizar('estabelecimentos', e.id, { status, contratoInicio: status === 'ATIVO' && !e.contratoInicio ? isoDia(new Date()) : e.contratoInicio });
        if (status === 'ATIVO' && e.status === 'EM_ANALISE') {
          // Aprovar o credenciamento libera o acesso do responsável e cria preços a partir da referência.
          doTenant('membros', (m) => m.status === 'PENDENTE_APROVACAO' && m.papeis.some((p) => p.estabelecimentoId === e.id)).forEach((m) => db.atualizar('membros', m.id, { status: 'ATIVO', aprovadoEm: iso(), aprovadoPorId: sessao.usuarioId }));
          if (!db.um('tabelaPrecos', (p) => p.estabelecimentoId === e.id)) {
            const categorias = { FARMACIA: ['FARMACIA'], LABORATORIO: ['EXAME_LABORATORIAL'], CENTRO_IMAGEM: ['EXAME_IMAGEM'], CLINICA_ODONTOLOGICA: ['ODONTOLOGIA'] }[e.tipo] ?? ['CONSULTA'];
            doTenant('itensCatalogo', (i) => categorias.includes(i.categoria)).forEach((i) => db.inserir('tabelaPrecos', { tenantId: sessao.tenantId, itemCatalogoId: i.id, estabelecimentoId: e.id, precoParticular: i.precoParticularReferencia, precoClube: null, vigenciaInicio: isoDia(new Date()) }));
          }
        }
        if (status !== 'ATIVO') doTenant('membros', (m) => m.status === 'ATIVO' && m.papeis.some((p) => p.estabelecimentoId === e.id)).forEach((m) => db.atualizar('membros', m.id, { status: 'BLOQUEADO' }));
        if (status === 'ATIVO' && e.status === 'SUSPENSO') doTenant('membros', (m) => m.status === 'BLOQUEADO' && m.papeis.some((p) => p.estabelecimentoId === e.id)).forEach((m) => db.atualizar('membros', m.id, { status: 'ATIVO' }));
        await auditar('ATUALIZAR', 'estabelecimentos', e.id, { statusAnterior: e.status, status });
      },

      async acessos() {
        exigir('acessos.gerenciar');
        await latencia();
        return doTenant('membros')
          .map((m) => ({ ...m, usuario: db.porId('usuarios', m.usuarioId), papeis: m.papeis.map((p) => ({ ...p, nome: PAPEIS[p.codigo]?.nome ?? p.codigo, estabelecimento: p.estabelecimentoId ? estab(p.estabelecimentoId) : null })) }))
          .filter((m) => !m.papeis.every((p) => p.codigo === 'ASSOCIADO'))
          .sort((a, b) => (a.status === 'PENDENTE_APROVACAO' ? -1 : 1) - (b.status === 'PENDENTE_APROVACAO' ? -1 : 1));
      },

      async alterarStatusAcesso(membroId, status) {
        exigir('acessos.gerenciar');
        const m = porId('membros', membroId);
        if (m.usuarioId === sessao.usuarioId) throw new ErroApi(422, 'Você não pode alterar o próprio acesso.');
        const est = m.papeis.find((p) => p.estabelecimentoId)?.estabelecimentoId;
        if (status === 'ATIVO' && est && estab(est).status !== 'ATIVO') throw new ErroApi(422, 'Aprove primeiro o credenciamento do estabelecimento.');
        db.atualizar('membros', m.id, { status, aprovadoEm: status === 'ATIVO' ? iso() : m.aprovadoEm, aprovadoPorId: sessao.usuarioId });
        await auditar('ATUALIZAR', 'membros', m.id, { statusAnterior: m.status, status });
      },

      // ---- Financeiro B2C ----
      async faturas({ status = '', competencia = '', busca = '' } = {}) {
        exigir('financeiro.ler');
        await latencia();
        const termo = busca.trim().toLowerCase();
        return doTenant('faturas', (f) => (!status || f.status === status) && (!competencia || f.competencia?.startsWith(competencia)))
          .map((f) => {
            const a = db.porId('assinaturas', f.assinaturaId);
            return { ...f, assinatura: a, titular: pessoa(a.titularId), plano: plano(a.planoId), cobrancas: db.onde('cobrancas', (c) => c.faturaId === f.id) };
          })
          .filter((f) => !termo || f.titular.nome.toLowerCase().includes(termo) || f.numero.toLowerCase().includes(termo) || f.assinatura.numeroContrato.toLowerCase().includes(termo))
          .sort((a, b) => b.vencimento.localeCompare(a.vencimento));
      },

      async gerarMensalidades(competencia) {
        exigir('financeiro.gerenciar');
        await latencia();
        const comp = new Date(`${competencia}-01T00:00:00Z`);
        let geradas = 0;
        for (const a of doTenant('assinaturas', (x) => ['ATIVA', 'INADIMPLENTE', 'SUSPENSA'].includes(x.status))) if (criarFaturaMensal(a, comp)) geradas++;
        await auditar('CRIAR', 'faturas', null, { acao: 'GERAR_MENSALIDADES', competencia, geradas });
        return geradas;
      },

      async emitirCobranca(faturaId, metodo) {
        exigir('financeiro.gerenciar');
        await latencia();
        const c = emitirCobrancaInterna(faturaId, metodo);
        await auditar('CRIAR', 'cobrancas', c.id, { faturaId, metodo, simulado: true });
        return c;
      },

      async simularPagamento(cobrancaId) {
        exigir('financeiro.gerenciar');
        await latencia();
        return confirmarPagamentoInterno(cobrancaId);
      },

      /** Executa a régua de cobrança "como se fosse hoje" (no backend real: job diário). */
      async processarRegua() {
        exigir('financeiro.gerenciar');
        await latencia();
        const hoje = new Date();
        const r = { vencidas: 0, inadimplentes: 0, suspensas: 0, canceladas: 0, mensagens: 0 };
        for (const f of doTenant('faturas', (x) => x.status === 'ABERTA' && new Date(x.vencimento) < addDias(hoje, -1))) {
          db.atualizar('faturas', f.id, { status: 'VENCIDA' });
          r.vencidas++;
        }
        const etapas = doTenant('reguaEtapas', (e) => e.ativa);
        for (const a of doTenant('assinaturas', (x) => ['ATIVA', 'INADIMPLENTE', 'SUSPENSA'].includes(x.status))) {
          const faturasA = db.onde('faturas', (f) => f.assinaturaId === a.id);
          const vencidas = faturasA.filter((f) => f.status === 'VENCIDA').sort((x, y) => x.vencimento.localeCompare(y.vencimento));
          const titular = pessoa(a.titularId);
          for (const f of faturasA.filter((x) => ['ABERTA', 'VENCIDA'].includes(x.status))) {
            const d = diasEntre(f.vencimento, hoje);
            const etapa = etapas.find((e) => e.diasRelativoVencimento === d && e.acao !== 'CANCELAR_ASSINATURA');
            if (etapa && !db.um('notificacoes', (n) => n.faturaId === f.id && n.reguaEtapaId === etapa.id)) {
              db.inserir('notificacoes', {
                tenantId: a.tenantId, canal: etapa.canal, pessoaId: titular.id, destino: titular.celular ? `+55${titular.celular}` : titular.email ?? '—', status: 'ENVIADA', faturaId: f.id, reguaEtapaId: etapa.id,
                conteudo: etapa.mensagem.replace('{nome}', titular.nome.split(' ')[0]).replace('{valor}', Number(f.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })).replace('{vencimento}', new Date(f.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })),
                enviadaEm: iso(),
              });
              r.mensagens++;
            }
          }
          if (!vencidas.length) continue;
          const atraso = diasEntre(vencidas[0].vencimento, hoje);
          const benefs = db.onde('beneficiarios', (b) => b.assinaturaId === a.id && b.status !== 'CANCELADO');
          if (atraso >= 60) {
            db.atualizar('assinaturas', a.id, { status: 'CANCELADA', canceladaEm: iso(), motivoCancelamento: 'Inadimplência superior a 60 dias (régua)' });
            benefs.forEach((b) => db.atualizar('beneficiarios', b.id, { status: 'CANCELADO' }));
            r.canceladas++;
          } else if (atraso >= 15 && a.status !== 'SUSPENSA') {
            db.atualizar('assinaturas', a.id, { status: 'SUSPENSA', suspensaEm: iso() });
            benefs.forEach((b) => db.atualizar('beneficiarios', b.id, { status: 'SUSPENSO' }));
            r.suspensas++;
          } else if (atraso >= 1 && a.status === 'ATIVA') {
            db.atualizar('assinaturas', a.id, { status: 'INADIMPLENTE' });
            r.inadimplentes++;
          }
        }
        await auditar('ATUALIZAR', 'assinaturas', null, { acao: 'PROCESSAR_REGUA', ...r }, { atorTipo: 'SISTEMA' });
        return r;
      },

      async dre(meses = 6) {
        exigir('financeiro.ler');
        await latencia();
        const base = inicioMes(new Date());
        const faturas = doTenant('faturas', (f) => f.status === 'PAGA');
        const transacoes = doTenant('transacoes', (t) => t.status === 'CONFIRMADA');
        const cobrancas = doTenant('cobrancas', (c) => c.status === 'RECEBIDA');
        return Array.from({ length: meses }, (_, i) => {
          const ini = addMeses(base, i - meses + 1);
          const fim = addMeses(ini, 1);
          const dentro = (d) => d && new Date(d) >= ini && new Date(d) < fim;
          const fats = faturas.filter((f) => dentro(f.pagaEm));
          const ts = transacoes.filter((t) => dentro(t.ocorridaEm));
          const mensalidades = soma(fats, 'valorPago');
          // Taxas reais quando a cobrança passou pelo simulador; estimativa para o histórico importado.
          const taxasGateway = centavos(
            fats.reduce((s, f) => {
              const c = cobrancas.find((x) => x.faturaId === f.id);
              if (c) return s + Number(c.taxaGateway);
              return s + ({ PIX: Number(f.valorPago) * 0.0099, BOLETO: 1.99, CARTAO_CREDITO: Number(f.valorPago) * 0.0299 }[f.metodoPagamento] ?? 0);
            }, 0),
          );
          const taxasParceiros = soma(ts, 'valorTaxaMatriz');
          const servicosProprios = soma(ts.filter((t) => estab(t.estabelecimentoId).natureza === 'PROPRIO'), 'valorPagoBeneficiario');
          const repasses = soma(ts, 'valorRepasseParceiro');
          const comissoes = soma(ts, 'valorComissaoProfissional');
          const receitaBruta = centavos(mensalidades + taxasParceiros + servicosProprios);
          const resultado = centavos(receitaBruta - taxasGateway - repasses - comissoes);
          return { mes: isoDia(ini), mensalidades, taxasParceiros, servicosProprios, receitaBruta, taxasGateway, repasses, comissoes, resultado, margem: receitaBruta ? resultado / receitaBruta : 0 };
        });
      },

      async notificacoes() {
        exigir('financeiro.ler');
        await latencia();
        return doTenant('notificacoes').sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 200).map((n) => ({ ...n, pessoa: n.pessoaId ? pessoa(n.pessoaId) : null }));
      },

      // ---- B2B ----
      async extratoB2B({ estabelecimentoId = '', de = '', ate = '', categoria = '' } = {}) {
        exigir('b2b.ler');
        await latencia();
        const lista = doTenant('transacoes', (t) => (!estabelecimentoId || t.estabelecimentoId === estabelecimentoId) && (!categoria || t.categoria === categoria) && (!de || t.ocorridaEm >= de) && (!ate || t.ocorridaEm.slice(0, 10) <= ate))
          .sort((a, b) => b.ocorridaEm.localeCompare(a.ocorridaEm))
          .map(transacaoCompleta);
        const validas = lista.filter((t) => t.status === 'CONFIRMADA');
        return {
          transacoes: lista,
          totais: {
            quantidade: validas.filter((t) => !t.transacaoOriginalId).length,
            valorOriginal: soma(validas, 'valorOriginal'), valorDesconto: soma(validas, 'valorDesconto'), valorPago: soma(validas, 'valorPagoBeneficiario'),
            repasses: soma(validas, 'valorRepasseParceiro'), taxas: soma(validas, 'valorTaxaMatriz'), comissoes: soma(validas, 'valorComissaoProfissional'),
          },
        };
      },

      async lotes() {
        exigir('b2b.ler');
        await latencia();
        const abertos = doTenant('estabelecimentos', (e) => e.natureza === 'CREDENCIADO')
          .map((e) => {
            const ts = doTenant('transacoes', (t) => t.estabelecimentoId === e.id && !t.loteRepasseId && t.status === 'CONFIRMADA');
            return { estabelecimento: e, quantidade: ts.length, repasses: soma(ts, 'valorRepasseParceiro'), taxas: soma(ts, 'valorTaxaMatriz'), liquido: centavos(soma(ts, 'valorRepasseParceiro') - soma(ts, 'valorTaxaMatriz')), desde: ts.map((t) => t.ocorridaEm).sort()[0] ?? null };
          })
          .filter((x) => x.quantidade);
        return { abertos, lotes: doTenant('lotesRepasse').sort((a, b) => b.periodoFim.localeCompare(a.periodoFim) || a.status.localeCompare(b.status)).map((l) => ({ ...l, estabelecimento: estab(l.estabelecimentoId) })) };
      },

      async fecharLote(estabelecimentoId) {
        exigir('b2b.gerenciar');
        await latencia();
        const e = porId('estabelecimentos', estabelecimentoId);
        const ts = doTenant('transacoes', (t) => t.estabelecimentoId === e.id && !t.loteRepasseId && t.status === 'CONFIRMADA');
        if (!ts.length) throw new ErroApi(422, 'Não há transações em aberto para este parceiro.');
        const datas = ts.map((t) => t.ocorridaEm).sort();
        const lote = db.inserir('lotesRepasse', {
          tenantId: sessao.tenantId, estabelecimentoId: e.id, periodoInicio: datas[0].slice(0, 10), periodoFim: datas[datas.length - 1].slice(0, 10),
          quantidadeTransacoes: ts.length, valorTotalOriginal: soma(ts, 'valorOriginal'), valorTotalDescontos: soma(ts, 'valorDesconto'),
          valorRepasses: soma(ts, 'valorRepasseParceiro'), valorTaxas: soma(ts, 'valorTaxaMatriz'),
          valorLiquido: centavos(soma(ts, 'valorRepasseParceiro') - soma(ts, 'valorTaxaMatriz')), status: 'FECHADO', fechadoEm: iso(),
        });
        ts.forEach((t) => db.atualizar('transacoes', t.id, { loteRepasseId: lote.id }));
        await auditar('CRIAR', 'lotesRepasse', lote.id, { estabelecimento: e.nome, quantidade: ts.length, valorLiquido: lote.valorLiquido });
        return lote;
      },

      async avancarLote(id) {
        exigir('b2b.gerenciar');
        const l = porId('lotesRepasse', id);
        const proximo = { FECHADO: 'APROVADO', APROVADO: 'PAGO' }[l.status];
        if (!proximo) throw new ErroApi(422, 'Este lote já foi liquidado.');
        db.atualizar('lotesRepasse', l.id, { status: proximo, ...(proximo === 'APROVADO' ? { aprovadoEm: iso(), aprovadoPorId: sessao.usuarioId } : { pagoEm: iso() }) });
        await auditar(proximo === 'APROVADO' ? 'APROVAR' : 'ATUALIZAR', 'lotesRepasse', l.id, { status: proximo });
      },

      // ---- Auditoria ----
      async auditoria({ entidade = '', acao = '' } = {}) {
        exigir('auditoria.ler');
        await latencia();
        return doTenant('logAuditoria', (l) => (!entidade || l.entidade === entidade) && (!acao || l.acao === acao)).slice(-300).reverse();
      },

      async verificarAuditoria() {
        exigir('auditoria.ler');
        const linhas = doTenant('logAuditoria');
        let anterior = null;
        for (const l of linhas) {
          const { hash, ...resto } = l;
          if (l.hashAnterior !== (anterior?.hash ?? null) || hash !== (await sha256(jsonCanonico(resto)))) return { ok: false, total: linhas.length, quebradoEm: l.id };
          anterior = l;
        }
        return { ok: true, total: linhas.length };
      },
    },

    // ======================================================================
    // PORTAL DA REDE CREDENCIADA
    // ======================================================================
    parceiro: {
      meuEstabelecimento() {
        exigir();
        const e = estab(sessao.estabelecimentoId);
        return { ...e, ofertas: db.onde('tabelaPrecos', (p) => p.estabelecimentoId === e.id).map((p) => ({ ...p, item: item(p.itemCatalogoId) })).sort((a, b) => a.item.nome.localeCompare(b.item.nome)), profissionais: doTenant('profissionais', (p) => p.estabelecimentoIds.includes(e.id)) };
      },

      async painel() {
        exigir();
        await latencia();
        const e = sessao.estabelecimentoId;
        const mes = inicioMes(new Date());
        const ts = doTenant('transacoes', (t) => t.estabelecimentoId === e && t.status === 'CONFIRMADA' && new Date(t.ocorridaEm) >= mes);
        const hoje = isoDia(new Date());
        return {
          usosMes: ts.filter((t) => !t.transacaoOriginalId).length,
          descontoMes: soma(ts, 'valorDesconto'),
          faturadoMes: soma(ts, 'valorPagoBeneficiario'),
          liquidoAberto: centavos(soma(doTenant('transacoes', (t) => t.estabelecimentoId === e && !t.loteRepasseId && t.status === 'CONFIRMADA'), 'valorRepasseParceiro') - soma(doTenant('transacoes', (t) => t.estabelecimentoId === e && !t.loteRepasseId && t.status === 'CONFIRMADA'), 'valorTaxaMatriz')),
          agendaHoje: doTenant('agendamentos', (a) => a.estabelecimentoId === e && a.inicio.slice(0, 10) === hoje && a.status !== 'CANCELADO').length,
          validacoesHoje: doTenant('validacoes', (v) => v.estabelecimentoId === e && v.criadoEm.slice(0, 10) === hoje).length,
          ultimas: doTenant('transacoes', (t) => t.estabelecimentoId === e).sort((a, b) => b.ocorridaEm.localeCompare(a.ocorridaEm)).slice(0, 6).map(transacaoCompleta),
          avaliacao: { nota: estab(e).notaMedia, total: estab(e).totalAvaliacoes },
        };
      },

      /** Consulta de elegibilidade por CPF, nº da carteirinha ou QR Code dinâmico. */
      async validar({ metodo, valor }) {
        exigir('parceiro.validar');
        await latencia();
        const e = estab(sessao.estabelecimentoId);
        if (e.status !== 'ATIVO') throw new ErroApi(403, 'Estabelecimento não está ativo na rede.');
        let beneficiario = null;
        let resultadoForcado = null;
        const entrada = String(valor ?? '').trim();

        if (metodo === 'CPF') {
          const p = umDoTenant('pessoas', (x) => x.cpf === somenteDigitos(entrada));
          const candidatos = p ? doTenant('beneficiarios', (b) => b.pessoaId === p.id) : [];
          beneficiario = candidatos.find((b) => b.status !== 'CANCELADO') ?? candidatos[0] ?? null;
        } else if (metodo === 'NUMERO_CARTEIRINHA') {
          beneficiario = umDoTenant('beneficiarios', (b) => b.numeroCarteirinha.toUpperCase() === entrada.toUpperCase());
        } else if (metodo === 'QR_CODE') {
          const [prefixo, numero, codigo, versao] = entrada.split('|');
          beneficiario = prefixo === 'ELO1' ? umDoTenant('beneficiarios', (b) => b.numeroCarteirinha === numero) : null;
          if (!beneficiario || Number(versao) !== beneficiario.versaoCarteirinha || !(await validarTotp(beneficiario.segredoQr, codigo))) {
            resultadoForcado = 'QR_INVALIDO';
            beneficiario = null;
          }
        } else throw new ErroApi(422, 'Método de validação inválido.');

        const assinatura = beneficiario ? db.porId('assinaturas', beneficiario.assinaturaId) : null;
        const elig = resultadoForcado
          ? { resultado: resultadoForcado, motivo: 'O código expira a cada 30 segundos. Peça para o associado abrir a carteirinha novamente.' }
          : avaliarElegibilidade({ beneficiario, assinatura });
        const validacao = db.inserir('validacoes', { tenantId: sessao.tenantId, beneficiarioId: beneficiario?.id ?? null, estabelecimentoId: e.id, membroId: sessao.membroId, metodo, resultado: elig.resultado });
        await auditar('LER', 'beneficiarios', beneficiario?.id ?? null, { acao: 'VALIDAR_ELEGIBILIDADE', metodo, resultado: elig.resultado, estabelecimento: e.nome });
        if (!beneficiario) return { ...elig, validacaoId: validacao.id, beneficiario: null };

        const p = pessoa(beneficiario.pessoaId);
        const pl = plano(assinatura.planoId);
        const ofertas = db.onde('tabelaPrecos', (x) => x.estabelecimentoId === e.id).map((pr) => {
          const it = item(pr.itemCatalogoId);
          return { item: it, preco: pr, simulacao: simularBeneficio({ beneficiario, estabelecimento: e, itemCatalogo: it }) };
        });
        // Minimização de dados (LGPD): o parceiro vê apenas o necessário para o atendimento.
        return {
          ...elig,
          validacaoId: validacao.id,
          beneficiario: {
            id: beneficiario.id, nome: p.nome, cpfMascarado: p.cpf ? `***.${p.cpf.slice(3, 6)}.***-${p.cpf.slice(9)}` : null, idade: idade(p.dataNascimento),
            tipo: beneficiario.tipo, parentesco: beneficiario.parentesco, numeroCarteirinha: beneficiario.numeroCarteirinha, plano: pl.nome, corPlano: pl.corDestaque,
            statusContrato: assinatura.status,
          },
          ofertas: ofertas.sort((a, b) => Number(b.simulacao.permitido) - Number(a.simulacao.permitido) || a.item.nome.localeCompare(b.item.nome)),
        };
      },

      async simular({ beneficiarioId, itemCatalogoId, quantidade = 1, valorInformado }) {
        exigir('parceiro.transacionar');
        const b = porId('beneficiarios', beneficiarioId);
        return simularBeneficio({ beneficiario: b, estabelecimento: estab(sessao.estabelecimentoId), itemCatalogo: porId('itensCatalogo', itemCatalogoId), quantidade: Number(quantidade) || 1, valorInformado: valorInformado ? Number(valorInformado) : undefined });
      },

      async registrarUso({ validacaoId, beneficiarioId, itemCatalogoId, quantidade = 1, valorInformado, profissionalId, agendamentoId, chaveIdempotencia }) {
        exigir('parceiro.transacionar');
        await latencia();
        const repetida = chaveIdempotencia && umDoTenant('transacoes', (t) => t.chaveIdempotencia === chaveIdempotencia);
        if (repetida) return transacaoCompleta(repetida);
        const e = estab(sessao.estabelecimentoId);
        const v = porId('validacoes', validacaoId);
        if (v.beneficiarioId !== beneficiarioId || v.estabelecimentoId !== e.id || v.resultado !== 'ELEGIVEL') throw new ErroApi(422, 'Valide o beneficiário antes de registrar o uso.');
        if (Date.now() - new Date(v.criadoEm).getTime() > 30 * 60_000) throw new ErroApi(422, 'Validação expirada (30 min). Valide novamente.');
        const b = porId('beneficiarios', beneficiarioId);
        const it = porId('itensCatalogo', itemCatalogoId);
        if (it.categoria === 'FARMACIA' && !(Number(valorInformado) > 0)) throw new ErroApi(422, 'Informe o valor da compra.');
        const qtd = Number(quantidade) || 1;
        const calc = simularBeneficio({ beneficiario: b, estabelecimento: e, itemCatalogo: it, quantidade: qtd, valorInformado: valorInformado ? Number(valorInformado) : undefined });
        if (!calc.permitido) throw new ErroApi(422, calc.motivo);
        const profId = profissionalId || (sessao.profissionalId ?? null);
        const rep = calcularRepasses({ regrasRepasse: doTenant('regrasRepasse'), estabelecimento: e, profissionalId: profId, item: it, tipoRegra: calc.regra.tipoRegra, valores: calc, quantidade: qtd });
        const codigo = 'AUT-' + crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
        const t = db.inserir('transacoes', {
          tenantId: sessao.tenantId, codigoAutorizacao: codigo, chaveIdempotencia: chaveIdempotencia || crypto.randomUUID(), beneficiarioId: b.id, pessoaId: b.pessoaId,
          estabelecimentoId: e.id, profissionalId: profId, itemCatalogoId: it.id, descricaoItem: it.nome, categoria: it.categoria, planoBeneficioId: calc.regra.id,
          validacaoId: v.id, agendamentoId: agendamentoId || null, origem: it.categoria === 'FARMACIA' ? 'BALCAO_FARMACIA' : 'PORTAL_PARCEIRO', status: 'CONFIRMADA', quantidade: qtd,
          valorOriginal: calc.valorOriginal, valorDesconto: calc.valorDesconto, valorPagoBeneficiario: calc.valorPago, valorCoparticipacao: calc.valorCoparticipacao,
          valorRepasseParceiro: rep.valorRepasseParceiro, valorTaxaMatriz: rep.valorTaxaMatriz, valorComissaoProfissional: rep.valorComissaoProfissional,
          regrasAplicadas: { beneficio: { id: calc.regra.id, tipoRegra: calc.regra.tipoRegra, valor: calc.regra.valor }, repasses: rep.aplicadas },
          autorizadaPorMembroId: sessao.membroId, ocorridaEm: iso(), confirmadaEm: iso(), transacaoOriginalId: null, motivoEstorno: null, loteRepasseId: null,
        });
        if (agendamentoId) db.atualizar('agendamentos', porId('agendamentos', agendamentoId).id, { status: 'ATENDIDO' });
        await auditar('CRIAR', 'transacoes', t.id, { codigo, item: it.nome, valorOriginal: t.valorOriginal, valorDesconto: t.valorDesconto, estabelecimento: e.nome });
        return transacaoCompleta(t);
      },

      async transacoes({ busca = '', de = '' } = {}) {
        exigir('parceiro.transacoes');
        await latencia();
        const termo = busca.trim().toLowerCase();
        return doTenant('transacoes', (t) => t.estabelecimentoId === sessao.estabelecimentoId && (!de || t.ocorridaEm >= de))
          .map(transacaoCompleta)
          .filter((t) => !termo || t.pessoa.nome.toLowerCase().includes(termo) || t.codigoAutorizacao.toLowerCase().includes(termo) || t.descricaoItem.toLowerCase().includes(termo))
          .sort((a, b) => b.ocorridaEm.localeCompare(a.ocorridaEm));
      },

      async estornar(transacaoId, motivo) {
        exigir('parceiro.estornar');
        await latencia();
        const t = porId('transacoes', transacaoId);
        if (t.estabelecimentoId !== sessao.estabelecimentoId) throw new ErroApi(404, 'Transação não encontrada.');
        if (t.status !== 'CONFIRMADA' || t.transacaoOriginalId) throw new ErroApi(422, 'Esta transação não pode ser estornada.');
        if (t.loteRepasseId && db.porId('lotesRepasse', t.loteRepasseId).status !== 'ABERTO') throw new ErroApi(422, 'Transação já conciliada em lote de repasse. Solicite ao hospital.');
        if (!motivo?.trim()) throw new ErroApi(422, 'Informe o motivo do estorno.');
        db.atualizar('transacoes', t.id, { status: 'ESTORNADA', motivoEstorno: motivo });
        const neg = (k) => -Number(t[k]);
        const estorno = db.inserir('transacoes', {
          ...t, id: crypto.randomUUID(), codigoAutorizacao: 'EST-' + t.codigoAutorizacao.slice(4), chaveIdempotencia: crypto.randomUUID(), status: 'CONFIRMADA', transacaoOriginalId: t.id,
          valorOriginal: neg('valorOriginal'), valorDesconto: neg('valorDesconto'), valorPagoBeneficiario: neg('valorPagoBeneficiario'), valorCoparticipacao: neg('valorCoparticipacao'),
          valorRepasseParceiro: neg('valorRepasseParceiro'), valorTaxaMatriz: neg('valorTaxaMatriz'), valorComissaoProfissional: neg('valorComissaoProfissional'),
          motivoEstorno: motivo, ocorridaEm: iso(), confirmadaEm: iso(), criadoEm: iso(), atualizadoEm: undefined, loteRepasseId: null, autorizadaPorMembroId: sessao.membroId,
        });
        await auditar('ESTORNAR', 'transacoes', t.id, { motivo, estornoId: estorno.id });
      },

      async agenda({ dia }) {
        exigir('parceiro.agenda');
        await latencia();
        return doTenant('agendamentos', (a) => a.estabelecimentoId === sessao.estabelecimentoId && a.inicio.slice(0, 10) === dia && (!sessao.profissionalId || a.profissionalId === sessao.profissionalId))
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
          .map(agendamentoCompleto);
      },

      async atualizarAgendamento(id, status) {
        exigir('parceiro.agenda');
        const a = porId('agendamentos', id);
        if (a.estabelecimentoId !== sessao.estabelecimentoId) throw new ErroApi(404, 'Agendamento não encontrado.');
        const permitidas = { AGENDADO: ['CONFIRMADO', 'CHECKIN', 'CANCELADO', 'FALTOU'], CONFIRMADO: ['CHECKIN', 'CANCELADO', 'FALTOU'], CHECKIN: ['EM_ATENDIMENTO', 'ATENDIDO'], EM_ATENDIMENTO: ['ATENDIDO'] };
        if (!permitidas[a.status]?.includes(status)) throw new ErroApi(422, 'Mudança de status não permitida.');
        db.atualizar('agendamentos', a.id, { status, ...(status === 'CONFIRMADO' ? { confirmadoEm: iso() } : {}), ...(status === 'CANCELADO' ? { canceladoEm: iso(), motivoCancelamento: 'Cancelado pelo estabelecimento' } : {}) });
        await auditar('ATUALIZAR', 'agendamentos', a.id, { status });
      },

      async beneficiariosAtendidos({ busca = '' } = {}) {
        exigir('parceiro.beneficiarios');
        await latencia();
        const mapa = new Map();
        for (const t of doTenant('transacoes', (x) => x.estabelecimentoId === sessao.estabelecimentoId && x.status === 'CONFIRMADA' && !x.transacaoOriginalId)) {
          const atual = mapa.get(t.beneficiarioId) ?? { usos: 0, economia: 0, ultimo: t.ocorridaEm };
          atual.usos++;
          atual.economia = centavos(atual.economia + Number(t.valorDesconto));
          if (t.ocorridaEm > atual.ultimo) atual.ultimo = t.ocorridaEm;
          mapa.set(t.beneficiarioId, atual);
        }
        for (const a of doTenant('agendamentos', (x) => x.estabelecimentoId === sessao.estabelecimentoId && x.beneficiarioId)) if (!mapa.has(a.beneficiarioId)) mapa.set(a.beneficiarioId, { usos: 0, economia: 0, ultimo: a.inicio });
        const termo = busca.trim().toLowerCase();
        return [...mapa.entries()]
          .map(([id, dados]) => {
            const b = beneficiarioCompleto(db.porId('beneficiarios', id));
            return { ...dados, id, nome: b.pessoa.nome, celular: b.pessoa.celular, email: b.pessoa.email, pessoaId: b.pessoaId, numeroCarteirinha: b.numeroCarteirinha, plano: b.plano.nome, tipo: b.tipo, statusContrato: b.assinatura.status };
          })
          .filter((x) => !termo || x.nome.toLowerCase().includes(termo) || x.numeroCarteirinha.toLowerCase().includes(termo))
          .sort((a, b) => b.ultimo.localeCompare(a.ultimo));
      },

      async atualizarContato(pessoaId, { celular, email }) {
        exigir('parceiro.beneficiarios');
        const p = porId('pessoas', pessoaId);
        const vinculado = doTenant('beneficiarios', (b) => b.pessoaId === p.id).some((b) => db.um('transacoes', (t) => t.beneficiarioId === b.id && t.estabelecimentoId === sessao.estabelecimentoId) || db.um('agendamentos', (a) => a.beneficiarioId === b.id && a.estabelecimentoId === sessao.estabelecimentoId));
        if (!vinculado) throw new ErroApi(403, 'Só é possível atualizar beneficiários atendidos por este estabelecimento.');
        if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApi(422, 'E-mail inválido.');
        db.atualizar('pessoas', p.id, { celular: somenteDigitos(celular) || p.celular, email: email || p.email });
        await auditar('ATUALIZAR', 'pessoas', p.id, { campos: ['celular', 'email'], origem: 'portal_parceiro' });
      },

      planosDisponiveis() {
        exigir('parceiro.preadesao');
        return doTenant('planos', (p) => p.ativo && p.publicado).sort((a, b) => a.nivel - b.nivel);
      },

      /** Venda pela rede: a adesão fica PENDENTE_ATIVACAO até o hospital ativar. */
      async preAdesao(dados) {
        exigir('parceiro.preadesao');
        await latencia();
        const r = criarContratoInterno({ ...dados, status: 'PENDENTE_ATIVACAO', canal: 'VENDEDOR', vendedorEstabelecimentoId: sessao.estabelecimentoId });
        await auditar('CRIAR', 'assinaturas', r.assinatura.id, { origem: 'pre_adesao_parceiro', estabelecimento: estab(sessao.estabelecimentoId).nome });
        return r.assinatura;
      },

      async minhasPreAdesoes() {
        exigir('parceiro.preadesao');
        return doTenant('assinaturas', (a) => a.vendedorEstabelecimentoId === sessao.estabelecimentoId).map(contratoResumo).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      },

      async repasses() {
        exigir('parceiro.repasses');
        await latencia();
        const ts = doTenant('transacoes', (t) => t.estabelecimentoId === sessao.estabelecimentoId && !t.loteRepasseId && t.status === 'CONFIRMADA');
        return {
          aberto: { quantidade: ts.length, repasses: soma(ts, 'valorRepasseParceiro'), taxas: soma(ts, 'valorTaxaMatriz'), liquido: centavos(soma(ts, 'valorRepasseParceiro') - soma(ts, 'valorTaxaMatriz')) },
          lotes: doTenant('lotesRepasse', (l) => l.estabelecimentoId === sessao.estabelecimentoId).sort((a, b) => b.periodoFim.localeCompare(a.periodoFim)),
        };
      },
    },

    // ======================================================================
    // APP DO BENEFICIÁRIO
    // ======================================================================
    app: {
      contexto() {
        exigir('app.usar');
        const eu = pessoa(sessao.pessoaId);
        const meuBenef = doTenant('beneficiarios', (b) => b.pessoaId === eu.id).sort((a, b) => (a.status === 'CANCELADO') - (b.status === 'CANCELADO'))[0];
        const assinatura = db.porId('assinaturas', meuBenef.assinaturaId);
        const familia = db.onde('beneficiarios', (b) => b.assinaturaId === assinatura.id && b.status !== 'CANCELADO');
        // Titular gerencia a família; dependente adulto vê só a própria carteirinha.
        const visiveis = meuBenef.tipo === 'TITULAR' ? familia : [meuBenef];
        return { eu, meuBenef, assinatura, plano: plano(assinatura.planoId), visiveis, ehTitular: meuBenef.tipo === 'TITULAR' };
      },

      async inicio() {
        const c = this.contexto();
        await latencia();
        const ids = new Set(c.visiveis.map((b) => b.id));
        const ts = doTenant('transacoes', (t) => ids.has(t.beneficiarioId) && t.status === 'CONFIRMADA');
        const mes = inicioMes(new Date());
        const faturas = c.ehTitular ? db.onde('faturas', (f) => f.assinaturaId === c.assinatura.id) : [];
        return {
          ...c,
          elegibilidade: avaliarElegibilidade({ beneficiario: c.meuBenef, assinatura: c.assinatura }),
          economiaMes: soma(ts.filter((t) => new Date(t.ocorridaEm) >= mes), 'valorDesconto'),
          economiaTotal: soma(ts, 'valorDesconto'),
          gastoMes: soma(ts.filter((t) => new Date(t.ocorridaEm) >= mes), 'valorPagoBeneficiario'),
          proximaFatura: faturas.filter((f) => ['ABERTA', 'VENCIDA'].includes(f.status)).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0] ?? null,
          agendamentos: doTenant('agendamentos', (a) => ids.has(a.beneficiarioId) && new Date(a.inicio) >= new Date() && !['CANCELADO', 'ATENDIDO', 'FALTOU'].includes(a.status)).sort((a, b) => a.inicio.localeCompare(b.inicio)).map(agendamentoCompleto),
          notificacoes: doTenant('notificacoes', (n) => n.pessoaId === c.assinatura.titularId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 5),
          branding: brandingDoTenant(sessao.tenantId),
          tenant: tenantAtual(),
        };
      },

      /** Inclui o segredo TOTP para gerar o QR offline (no app real: guardado no Keystore/Keychain). */
      carteirinhas() {
        const c = this.contexto();
        return c.visiveis.map((b) => ({ ...b, pessoa: pessoa(b.pessoaId), plano: c.plano, assinatura: c.assinatura, elegibilidade: avaliarElegibilidade({ beneficiario: b, assinatura: c.assinatura }) }));
      },

      async rede({ categoria = '', busca = '', ordenarPor = 'distancia', lat, lon } = {}) {
        const c = this.contexto();
        await latencia();
        const origem = { lat: lat ?? c.eu.latitude, lon: lon ?? c.eu.longitude };
        const termo = busca.trim().toLowerCase();
        return doTenant('estabelecimentos', (e) => e.status === 'ATIVO')
          .map((e) => {
            const ofertas = db.onde('tabelaPrecos', (p) => p.estabelecimentoId === e.id).map((p) => ({ ...p, item: item(p.itemCatalogoId) }));
            const melhor = ofertas.map((o) => simularBeneficio({ beneficiario: c.meuBenef, estabelecimento: e, itemCatalogo: o.item })).filter((s) => s.permitido).sort((a, b) => b.valorDesconto / (b.valorOriginal || 1) - a.valorDesconto / (a.valorOriginal || 1))[0];
            return {
              ...e, ofertas, categorias: [...new Set(ofertas.map((o) => o.item.categoria))],
              distanciaKm: e.latitude != null && origem.lat != null ? distanciaKm(origem.lat, origem.lon, e.latitude, e.longitude) : null,
              destaque: melhor ? melhor.motivo : null,
              profissionais: doTenant('profissionais', (p) => p.estabelecimentoIds.includes(e.id)).map((p) => ({ ...p, especialidades: p.especialidadeIds.map((id) => db.porId('especialidades', id).nome) })),
            };
          })
          .filter((e) => (!categoria || e.categorias.includes(categoria)) && (!termo || e.nome.toLowerCase().includes(termo) || e.bairro?.toLowerCase().includes(termo) || e.ofertas.some((o) => o.item.nome.toLowerCase().includes(termo)) || e.profissionais.some((p) => p.especialidades.some((s) => s.toLowerCase().includes(termo)) || p.nome.toLowerCase().includes(termo))))
          .sort((a, b) => (ordenarPor === 'avaliacao' ? (b.notaMedia ?? 0) - (a.notaMedia ?? 0) : (a.distanciaKm ?? 999) - (b.distanciaKm ?? 999)));
      },

      async estabelecimento(id) {
        const c = this.contexto();
        await latencia();
        const e = porId('estabelecimentos', id);
        return {
          ...e,
          ofertas: db.onde('tabelaPrecos', (p) => p.estabelecimentoId === e.id).map((p) => ({ item: item(p.itemCatalogoId), preco: p, simulacao: simularBeneficio({ beneficiario: c.meuBenef, estabelecimento: e, itemCatalogo: item(p.itemCatalogoId) }) })).sort((a, b) => a.item.nome.localeCompare(b.item.nome)),
          profissionais: doTenant('profissionais', (p) => p.estabelecimentoIds.includes(e.id)).map((p) => ({ ...p, especialidades: p.especialidadeIds.map((x) => db.porId('especialidades', x).nome) })),
          avaliacoes: doTenant('avaliacoes', (a) => a.estabelecimentoId === e.id && a.status === 'PUBLICADA').sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 8).map((a) => ({ ...a, autor: a.anonima ? 'Associado' : pessoa(a.pessoaId).nome.split(' ')[0] })),
        };
      },

      horarios({ profissionalId, estabelecimentoId }) {
        this.contexto();
        return horariosLivres({ profissionalId, estabelecimentoId, dias: 14 });
      },

      async agendar({ beneficiarioId, profissionalId, estabelecimentoId, inicio }) {
        const c = this.contexto();
        await latencia();
        const b = c.visiveis.find((x) => x.id === beneficiarioId);
        if (!b) throw new ErroApi(403, 'Beneficiário não pertence à sua conta.');
        const ag = criarAgendamentoInterno({ beneficiario: b, profissionalId, estabelecimentoId, inicio, origem: 'APP' });
        await auditar('CRIAR', 'agendamentos', ag.id, { origem: 'APP' });
        return ag;
      },

      async cancelarAgendamento(id) {
        const c = this.contexto();
        const a = porId('agendamentos', id);
        if (!c.visiveis.some((b) => b.id === a.beneficiarioId)) throw new ErroApi(404, 'Agendamento não encontrado.');
        if (!['AGENDADO', 'CONFIRMADO'].includes(a.status)) throw new ErroApi(422, 'Este agendamento não pode mais ser cancelado.');
        db.atualizar('agendamentos', a.id, { status: 'CANCELADO', canceladoEm: iso(), motivoCancelamento: 'Cancelado pelo associado no app' });
        await auditar('ATUALIZAR', 'agendamentos', a.id, { status: 'CANCELADO' });
      },

      async faturas() {
        const c = this.contexto();
        await latencia();
        if (!c.ehTitular) return [];
        return db.onde('faturas', (f) => f.assinaturaId === c.assinatura.id).sort((a, b) => b.vencimento.localeCompare(a.vencimento)).map((f) => ({ ...f, cobrancas: db.onde('cobrancas', (x) => x.faturaId === f.id) }));
      },

      async emitirCobranca(faturaId, metodo) {
        const c = this.contexto();
        await latencia();
        if (porId('faturas', faturaId).assinaturaId !== c.assinatura.id) throw new ErroApi(404, 'Fatura não encontrada.');
        const cob = emitirCobrancaInterna(faturaId, metodo);
        await auditar('CRIAR', 'cobrancas', cob.id, { metodo, simulado: true });
        return cob;
      },

      async simularPagamento(cobrancaId) {
        const c = this.contexto();
        await latencia();
        if (porId('faturas', porId('cobrancas', cobrancaId).faturaId).assinaturaId !== c.assinatura.id) throw new ErroApi(404, 'Cobrança não encontrada.');
        return confirmarPagamentoInterno(cobrancaId);
      },

      async historico() {
        const c = this.contexto();
        await latencia();
        const ids = new Set(c.visiveis.map((b) => b.id));
        return doTenant('transacoes', (t) => ids.has(t.beneficiarioId) && !t.transacaoOriginalId)
          .sort((a, b) => b.ocorridaEm.localeCompare(a.ocorridaEm))
          .map((t) => ({ ...transacaoCompleta(t), avaliacao: db.um('avaliacoes', (a) => a.transacaoBeneficioId === t.id) }));
      },

      async avaliar({ transacaoId, nota, comentario }) {
        const c = this.contexto();
        const t = porId('transacoes', transacaoId);
        if (!c.visiveis.some((b) => b.id === t.beneficiarioId)) throw new ErroApi(404, 'Uso não encontrado.');
        if (t.status !== 'CONFIRMADA') throw new ErroApi(422, 'Não é possível avaliar um uso estornado.');
        if (db.um('avaliacoes', (a) => a.transacaoBeneficioId === t.id)) throw new ErroApi(409, 'Você já avaliou este atendimento.');
        const n = Number(nota);
        if (!(n >= 1 && n <= 5)) throw new ErroApi(422, 'Escolha de 1 a 5 estrelas.');
        db.inserir('avaliacoes', { tenantId: sessao.tenantId, pessoaId: c.eu.id, transacaoBeneficioId: t.id, profissionalId: t.profissionalId, estabelecimentoId: t.estabelecimentoId, nota: n, comentario: comentario?.trim() || null, anonima: false, status: 'PUBLICADA' });
        for (const [tabela, campo, id] of [['estabelecimentos', 'estabelecimentoId', t.estabelecimentoId], ['profissionais', 'profissionalId', t.profissionalId]]) {
          if (!id) continue;
          const notas = doTenant('avaliacoes', (a) => a[campo] === id).map((a) => a.nota);
          db.atualizar(tabela, id, { notaMedia: centavos(notas.reduce((s, x) => s + x, 0) / notas.length), totalAvaliacoes: notas.length });
        }
        await auditar('CRIAR', 'avaliacoes', t.id, { nota: n });
      },

      async adicionarDependente(dados) {
        const c = this.contexto();
        if (!c.ehTitular) throw new ErroApi(403, 'Somente o titular pode incluir dependentes.');
        await latencia();
        const b = adicionarDependenteInterno(c.assinatura, dados);
        await auditar('CRIAR', 'beneficiarios', b.id, { origem: 'APP' });
        return b;
      },

      consentimentos() {
        const c = this.contexto();
        return doTenant('consentimentos', (x) => x.pessoaId === c.eu.id && !x.revogadoEm);
      },

      async alterarConsentimento(finalidade, concedido) {
        const c = this.contexto();
        doTenant('consentimentos', (x) => x.pessoaId === c.eu.id && x.finalidade === finalidade && !x.revogadoEm).forEach((x) => db.atualizar('consentimentos', x.id, { revogadoEm: iso() }));
        db.inserir('consentimentos', { tenantId: sessao.tenantId, pessoaId: c.eu.id, finalidade, concedido, versaoTermo: '2025.1', canal: 'APP', registradoEm: iso(), revogadoEm: null });
        await auditar('ATUALIZAR', 'consentimentos', c.eu.id, { finalidade, concedido });
      },

      async atualizarPerfil({ celular, email }) {
        const c = this.contexto();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApi(422, 'E-mail inválido.');
        db.atualizar('pessoas', c.eu.id, { celular: somenteDigitos(celular) || c.eu.celular, email: email || c.eu.email });
        await auditar('ATUALIZAR', 'pessoas', c.eu.id, { campos: ['celular', 'email'], origem: 'APP' });
      },

      especialidades() {
        return db.todos('especialidades');
      },
    },
  };
}
