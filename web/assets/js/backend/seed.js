// =============================================================================
// Gerador de dados 100% FICTÍCIOS. Nomes, CPFs, CNPJs, telefones e e-mails são
// inventados (e-mails no domínio reservado .teste). Datas relativas ao dia atual.
// =============================================================================

import { addDias, addMeses, centavos, criarPrng, inicioMes } from '../lib/util.js';
import { base32Aleatorio, hashSenha, jsonCanonico, sha256 } from '../lib/crypto.js';
import { TABELAS } from './db.js';
import { calcularBeneficio, calcularRepasses, escolherRegra, inicioPeriodo } from './regras.js';

export const SENHA_PADRAO = '123456';

export const CONTAS_DEMO = [
  { tenant: 'hospital-vida', email: 'admin@hospitalvida.teste', portal: 'admin', papel: 'Administrador do hospital' },
  { tenant: 'hospital-vida', email: 'financeiro@hospitalvida.teste', portal: 'admin', papel: 'Financeiro' },
  { tenant: 'hospital-vida', email: 'recepcao@hospitalvida.teste', portal: 'admin', papel: 'Recepção' },
  { tenant: 'hospital-vida', email: 'clinica@hospitalvida.teste', portal: 'parceiro', papel: 'Gestor — Clínica Bem Viver' },
  { tenant: 'hospital-vida', email: 'laboratorio@hospitalvida.teste', portal: 'parceiro', papel: 'Gestor — Laboratório Mais Saúde' },
  { tenant: 'hospital-vida', email: 'farmacia@hospitalvida.teste', portal: 'parceiro', papel: 'Balcão — Drogaria Vida Leve' },
  { tenant: 'hospital-vida', email: 'odonto@hospitalvida.teste', portal: 'parceiro', papel: 'Dentista — OdontoSorriso' },
  { tenant: 'hospital-vida', email: 'cliente@hospitalvida.teste', portal: 'app', papel: 'Associada titular (plano Família)' },
  { tenant: 'rede-sorriso', email: 'admin@redesorriso.teste', portal: 'admin', papel: 'Administrador (2º tenant)' },
  { tenant: 'rede-sorriso', email: 'cliente@redesorriso.teste', portal: 'app', papel: 'Associado (2º tenant)' },
];

const NOMES_F = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Luana', 'Marina', 'Natália', 'Olívia', 'Patrícia', 'Rafaela', 'Sabrina', 'Tatiane', 'Valéria', 'Yasmin', 'Aline', 'Bruna', 'Cecília', 'Débora', 'Elaine', 'Francisca', 'Giovana', 'Ingrid', 'Joana', 'Kelly', 'Lívia', 'Mirela', 'Rosângela', 'Sílvia', 'Teresa', 'Vitória', 'Antônia', 'Clara', 'Lúcia'];
const NOMES_M = ['André', 'Bruno', 'Carlos', 'Daniel', 'Eduardo', 'Felipe', 'Gabriel', 'Henrique', 'Igor', 'João', 'Leonardo', 'Lucas', 'Marcelo', 'Nicolas', 'Otávio', 'Paulo', 'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Wesley', 'Antônio', 'Benedito', 'Caio', 'Diego', 'Emanuel', 'Francisco', 'Gustavo', 'Hugo', 'Ítalo', 'José', 'Kauã', 'Luiz', 'Mateus', 'Pedro', 'Raimundo', 'Sérgio', 'Túlio', 'Victor', 'Davi'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Rocha', 'Barbosa', 'Moura', 'Cavalcante', 'Bezerra', 'Holanda', 'Freitas', 'Teixeira', 'Nogueira', 'Pinheiro', 'Sales', 'Campos', 'Duarte', 'Andrade', 'Monteiro', 'Brito', 'Farias', 'Queiroz', 'Machado', 'Vieira', 'Batista', 'Mendes', 'Leite', 'Fontenele', 'Magalhães', 'Torres'];
const BAIRROS = ['Centro', 'Aldeota', 'Meireles', 'Fátima', 'Benfica', 'Parquelândia', 'Messejana', 'Papicu', 'Cocó', 'Montese', 'Maraponga', 'Jacarecanga', 'Dionísio Torres', 'Joaquim Távora'];
const RUAS = ['Rua das Acácias', 'Rua dos Ipês', 'Avenida das Palmeiras', 'Rua do Sol Nascente', 'Travessa da Esperança', 'Rua Bela Vista', 'Avenida Central', 'Rua dos Cajueiros', 'Rua das Jangadas', 'Rua Mar Azul', 'Rua dos Coqueiros', 'Rua Boa Viagem'];
const COMENTARIOS_BONS = ['Atendimento excelente, muito atenciosa.', 'Rápido e sem burocracia com a carteirinha.', 'Ótimo profissional, explicou tudo com calma.', 'Desconto aplicado na hora, recomendo.', 'Ambiente limpo e equipe educada.', 'Fui muito bem atendido.', null, null];
const COMENTARIOS_MEDIOS = ['Demorou um pouco para ser atendido.', 'Bom atendimento, mas a recepção estava cheia.', 'Tive que explicar o desconto no balcão.', null];
const MOTIVOS_CANCELAMENTO = ['Mudou de cidade', 'Questões financeiras', 'Contratou plano de saúde', 'Pouco uso dos benefícios'];

const iso = (d) => new Date(d).toISOString();
const isoDia = (d) => new Date(d).toISOString().slice(0, 10);

function dvMod11(base, pesos) {
  const soma = [...base].reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

function gerarCpf(r) {
  const base = r.digitos(9);
  const d1 = dvMod11(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dvMod11(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

function gerarCnpj(r) {
  const base = r.digitos(8) + '0001';
  const d1 = dvMod11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dvMod11(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + d2;
}

const codigoAutorizacao = (r) => 'AUT-' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[r.int(0, 31)]).join('');

export async function gerarSeed() {
  const r = criarPrng(20261031);
  const hoje = new Date();
  const T = Object.fromEntries(TABELAS.map((t) => [t, []]));
  const ins = (tabela, linha) => {
    const l = { id: crypto.randomUUID(), criadoEm: iso(hoje), ...linha };
    T[tabela].push(l);
    return l;
  };

  // ---------------------------------------------------------------------------
  // Especialidades (catálogo global)
  // ---------------------------------------------------------------------------
  const esp = {};
  for (const [codigo, nome, area] of [
    ['225125', 'Clínica Médica', 'MEDICA'], ['225120', 'Cardiologia', 'MEDICA'], ['225124', 'Pediatria', 'MEDICA'],
    ['225250', 'Ginecologia e Obstetrícia', 'MEDICA'], ['225135', 'Dermatologia', 'MEDICA'], ['225270', 'Ortopedia', 'MEDICA'],
    ['225265', 'Oftalmologia', 'MEDICA'], ['251510', 'Psicologia', 'MULTIPROFISSIONAL'], ['223605', 'Fisioterapia', 'MULTIPROFISSIONAL'],
    ['223710', 'Nutrição', 'MULTIPROFISSIONAL'], ['223208', 'Odontologia — Clínico Geral', 'ODONTOLOGICA'], ['223212', 'Endodontia', 'ODONTOLOGICA'],
  ]) esp[nome] = ins('especialidades', { codigo, nome, area, ativa: true });

  // ---------------------------------------------------------------------------
  // Helpers por tenant
  // ---------------------------------------------------------------------------
  const usuariosPorEmail = {};
  async function criarUsuario(email, nome) {
    if (usuariosPorEmail[email]) return usuariosPorEmail[email];
    const sal = base32Aleatorio(8, r.num);
    const u = ins('usuarios', { authUserId: null, email, nome, sal, senhaHash: await hashSenha(SENHA_PADRAO, sal), ativo: true, ultimoAcessoEm: null });
    u.authUserId = u.id;
    usuariosPorEmail[email] = u;
    return u;
  }
  async function criarMembro(tenant, { email, nome, papel, estabelecimentoId = null, profissionalId = null, pessoaId = null, status = 'ATIVO' }) {
    const u = await criarUsuario(email, nome);
    return ins('membros', {
      tenantId: tenant.id, usuarioId: u.id, status, profissionalId, pessoaId,
      papeis: [{ codigo: papel, estabelecimentoId }],
      aprovadoEm: status === 'ATIVO' ? iso(addDias(hoje, -200)) : null,
    });
  }

  function criarPessoa(tenant, { nome, sexo, nascimento, cpf, parentesco }) {
    const sobrenome = nome.split(' ').slice(-1)[0];
    return ins('pessoas', {
      tenantId: tenant.id, nome, nomeSocial: null, cpf: cpf ?? (parentesco === 'FILHO' && r.chance(0.4) ? null : gerarCpf(r)),
      dataNascimento: isoDia(nascimento), sexo,
      email: parentesco ? null : `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${sobrenome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${r.int(1, 99)}@email.teste`,
      celular: parentesco ? null : `85${r.item(['98', '99', '97'])}${r.digitos(7)}`,
      cep: '60' + r.digitos(6), logradouro: r.item(RUAS), numero: String(r.int(10, 2500)), bairro: r.item(BAIRROS),
      cidade: tenant.cidade, uf: 'CE',
      latitude: -3.7319 + (r.num() - 0.5) * 0.12, longitude: -38.5267 + (r.num() - 0.5) * 0.12,
    });
  }

  function nomeAleatorio(sexo, sobrenomes) {
    const primeiro = r.item(sexo === 'FEMININO' ? NOMES_F : NOMES_M);
    return `${primeiro} ${sobrenomes ?? `${r.item(SOBRENOMES)} ${r.item(SOBRENOMES)}`}`;
  }

  function nascimentoAleatorio(minIdade, maxIdade) {
    const anos = r.int(minIdade, maxIdade);
    return new Date(Date.UTC(hoje.getUTCFullYear() - anos, r.int(0, 11), r.int(1, 28)));
  }

  /** Assinatura + beneficiários + faturas coerentes com o status desejado. */
  function criarContrato(tenant, ctx, { titular, dependentes, plano, status, inicio, diaVencimento, metodo, canal, prefixo }) {
    ctx.seqContrato += 1;
    const extras = Math.max(0, dependentes.length - plano.dependentesInclusos);
    const valorMensalidade = centavos(Number(plano.valorMensalidade) + extras * Number(plano.valorDependenteAdicional ?? 0));
    const canceladaEm = status === 'CANCELADA' ? addMeses(inicio, r.int(3, 9)) : null;
    const assinatura = ins('assinaturas', {
      tenantId: tenant.id, numeroContrato: `${prefixo}-${String(ctx.seqContrato).padStart(6, '0')}`, planoId: plano.id,
      titularId: titular.id, responsavelFinanceiroId: null, status, canalVenda: canal, valorMensalidade, diaVencimento,
      metodoPagamentoPreferido: metodo, gateway: 'SIMULADO', inicioVigencia: isoDia(inicio),
      fimFidelidade: plano.fidelidadeMeses ? isoDia(addMeses(inicio, plano.fidelidadeMeses)) : null,
      suspensaEm: null, canceladaEm: canceladaEm ? iso(canceladaEm) : null,
      motivoCancelamento: canceladaEm ? r.item(MOTIVOS_CANCELAMENTO) : null, criadoEm: iso(inicio),
    });
    const carenciaAte = plano.carenciaPadraoDias ? isoDia(addDias(inicio, plano.carenciaPadraoDias)) : null;
    const statusBenef = status === 'CANCELADA' ? 'CANCELADO' : status === 'SUSPENSA' ? 'SUSPENSO' : 'ATIVO';
    const benefs = [titular, ...dependentes].map((p, i) =>
      ins('beneficiarios', {
        tenantId: tenant.id, assinaturaId: assinatura.id, pessoaId: p.id, tipo: i === 0 ? 'TITULAR' : 'DEPENDENTE',
        parentesco: i === 0 ? null : p._parentesco, numeroCarteirinha: `${prefixo}${String(ctx.seqContrato).padStart(6, '0')}-${String(i).padStart(2, '0')}`,
        status: statusBenef, inicioVigencia: isoDia(inicio), fimVigencia: canceladaEm ? isoDia(canceladaEm) : null, carenciaAte,
        segredoQr: base32Aleatorio(20, r.num), versaoCarteirinha: 1, criadoEm: iso(inicio),
      }),
    );
    dependentes.forEach((d) => delete d._parentesco);

    // A mensalidade é emitida ~15 dias antes do vencimento (pode já existir a do mês seguinte).
    if (status !== 'PENDENTE_ATIVACAO') gerarFaturas(tenant, ctx, assinatura, { inicio, fim: canceladaEm ?? addDias(hoje, 15) });
    return { assinatura, benefs };
  }

  function gerarFaturas(tenant, ctx, assinatura, { inicio, fim }) {
    const faturas = [];
    for (let m = inicioMes(inicio); m <= fim; m = addMeses(m, 1)) {
      const vencimento = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), assinatura.diaVencimento));
      if (vencimento < new Date(assinatura.inicioVigencia) || vencimento > fim) continue;
      ctx.seqFatura += 1;
      faturas.push(
        ins('faturas', {
          tenantId: tenant.id, assinaturaId: assinatura.id, numero: `${tenant.prefixo}${isoDia(m).slice(0, 7).replace('-', '')}-${String(ctx.seqFatura).padStart(5, '0')}`,
          tipo: 'MENSALIDADE', competencia: isoDia(m), vencimento: isoDia(vencimento),
          valorOriginal: assinatura.valorMensalidade, valorDesconto: 0, valorJuros: 0, valorMulta: 0, valorTotal: assinatura.valorMensalidade,
          valorPago: null, status: vencimento >= hoje ? 'ABERTA' : 'PAGA', metodoPagamento: null, pagaEm: null, criadoEm: iso(addDias(vencimento, -10)),
        }),
      );
    }
    const vencidasDesejadas = { INADIMPLENTE: 1, SUSPENSA: 2 }[assinatura.status] ?? 0;
    const passadas = faturas.filter((f) => new Date(f.vencimento) < hoje);
    passadas.forEach((f, i) => {
      if (i >= passadas.length - vencidasDesejadas) {
        f.status = 'VENCIDA';
        return;
      }
      const atraso = r.chance(0.06) ? r.int(4, 12) : r.int(-4, 1);
      if (atraso > 0) {
        f.valorMulta = centavos(Number(f.valorOriginal) * 0.02);
        f.valorJuros = centavos(Number(f.valorOriginal) * 0.00033 * atraso);
        f.valorTotal = centavos(Number(f.valorOriginal) + f.valorMulta + f.valorJuros);
      }
      f.status = 'PAGA';
      f.valorPago = f.valorTotal;
      f.metodoPagamento = assinatura.metodoPagamentoPreferido;
      f.pagaEm = iso(addDias(f.vencimento, atraso));
    });
    if (assinatura.status === 'SUSPENSA') {
      const primeiraVencida = passadas[passadas.length - 2];
      if (primeiraVencida) assinatura.suspensaEm = iso(addDias(primeiraVencida.vencimento, 15));
    }
  }

  // ---------------------------------------------------------------------------
  // TENANT 1 — Hospital Vida (filantrópico)
  // ---------------------------------------------------------------------------
  const t1 = ins('tenants', {
    slug: 'hospital-vida', tipo: 'HOSPITAL_FILANTROPICO', status: 'ATIVO',
    razaoSocial: 'Associação Beneficente Hospital Vida (fictícia)', nomeFantasia: 'Hospital Vida', cnpj: gerarCnpj(r),
    cidade: 'Fortaleza', prefixo: 'VID', criadoEm: iso(addMeses(hoje, -16)),
  });
  ins('tenantBranding', {
    tenantId: t1.id, nomeApp: 'Vida+ Benefícios', corPrimaria: '#0F766E', corSecundaria: '#ECFDF5',
    telefoneEmergencia: '192', whatsappSuporte: '85940000000', telefoneCentral: '8540000000',
    textoBoasVindas: 'Seu clube de benefícios do Hospital Vida.',
  });
  const ctx1 = { seqContrato: 0, seqFatura: 0 };

  const itens = {};
  for (const [codigoInterno, categoria, nome, preco, especialidade] of [
    ['CON-CLIN', 'CONSULTA', 'Consulta clínica geral', 180, 'Clínica Médica'],
    ['CON-CARD', 'CONSULTA', 'Consulta cardiologia', 280, 'Cardiologia'],
    ['CON-PED', 'CONSULTA', 'Consulta pediatria', 220, 'Pediatria'],
    ['CON-GIN', 'CONSULTA', 'Consulta ginecologia', 250, 'Ginecologia e Obstetrícia'],
    ['CON-DERM', 'CONSULTA', 'Consulta dermatologia', 260, 'Dermatologia'],
    ['CON-ORT', 'CONSULTA', 'Consulta ortopedia', 260, 'Ortopedia'],
    ['CON-OFT', 'CONSULTA', 'Consulta oftalmologia', 240, 'Oftalmologia'],
    ['CON-PSI', 'CONSULTA', 'Sessão de psicologia', 180, 'Psicologia'],
    ['CON-NUT', 'CONSULTA', 'Consulta nutrição', 200, 'Nutrição'],
    ['LAB-HEMO', 'EXAME_LABORATORIAL', 'Hemograma completo', 35],
    ['LAB-GLIC', 'EXAME_LABORATORIAL', 'Glicemia de jejum', 18],
    ['LAB-LIPI', 'EXAME_LABORATORIAL', 'Perfil lipídico', 60],
    ['LAB-TSH', 'EXAME_LABORATORIAL', 'TSH', 55],
    ['LAB-URINA', 'EXAME_LABORATORIAL', 'Urina tipo 1', 22],
    ['LAB-CREA', 'EXAME_LABORATORIAL', 'Creatinina', 20],
    ['LAB-VITD', 'EXAME_LABORATORIAL', 'Vitamina D', 120],
    ['IMG-RXT', 'EXAME_IMAGEM', 'Raio-X de tórax', 90],
    ['IMG-USGA', 'EXAME_IMAGEM', 'Ultrassom de abdome total', 220],
    ['IMG-TCC', 'EXAME_IMAGEM', 'Tomografia de crânio', 650],
    ['IMG-MAMO', 'EXAME_IMAGEM', 'Mamografia bilateral', 240],
    ['IMG-ECG', 'EXAME_IMAGEM', 'Eletrocardiograma', 80],
    ['ODO-AVAL', 'ODONTOLOGIA', 'Avaliação odontológica', 120, 'Odontologia — Clínico Geral'],
    ['ODO-PROF', 'ODONTOLOGIA', 'Limpeza (profilaxia)', 180],
    ['ODO-REST', 'ODONTOLOGIA', 'Restauração em resina', 250],
    ['ODO-EXO', 'ODONTOLOGIA', 'Extração simples', 220],
    ['ODO-CANAL', 'ODONTOLOGIA', 'Tratamento de canal (molar)', 1100, 'Endodontia'],
    ['ODO-CLAR', 'ODONTOLOGIA', 'Clareamento dental', 900],
    ['FAR-GEN', 'FARMACIA', 'Medicamentos genéricos', 100],
    ['FAR-REF', 'FARMACIA', 'Medicamentos de referência', 100],
    ['FAR-DERMO', 'FARMACIA', 'Dermocosméticos', 100],
    ['VAC-GRIPE', 'VACINA', 'Vacina da gripe (tetravalente)', 120],
    ['VAC-HPV', 'VACINA', 'Vacina HPV (dose)', 750],
    ['TER-FISIO', 'TERAPIA', 'Sessão de fisioterapia', 120, 'Fisioterapia'],
    ['CIR-CATA', 'CIRURGIA_ELETIVA', 'Cirurgia de catarata (por olho)', 4500],
    ['CIR-VASEC', 'CIRURGIA_ELETIVA', 'Vasectomia', 2500],
    ['PA-CONS', 'PRONTO_ATENDIMENTO', 'Atendimento no pronto-socorro', 350],
  ]) {
    itens[codigoInterno] = ins('itensCatalogo', {
      tenantId: t1.id, categoria, codigoInterno, nome, precoParticularReferencia: preco,
      especialidadeId: especialidade ? esp[especialidade].id : null,
      exigeAgendamento: !['FARMACIA', 'PRONTO_ATENDIMENTO'].includes(categoria), ativo: true,
    });
  }

  // Planos e regras -------------------------------------------------------------
  const planos = {};
  for (const [codigo, nome, nivel, valor, incl, max, adicional, carencia, extra, cor, descricao] of [
    ['BRONZE', 'Bronze', 1, 49.9, 0, 2, 19.9, 30, {}, '#B45309', 'Descontos em consultas e exames básicos.'],
    ['PRATA', 'Prata', 2, 89.9, 2, 4, 24.9, 30, {}, '#64748B', 'Mais cobertura para consultas, imagem e odontologia.'],
    ['OURO', 'Ouro', 3, 139.9, 3, 5, 29.9, 0, { cashbackPercentual: 2 }, '#CA8A04', 'Consultas inclusas na rede própria e descontos premium.'],
    ['FAMILIA', 'Família', 4, 189.9, 5, 6, 29.9, 0, {}, '#0F766E', 'Para o núcleo familiar, com dependentes inclusos.'],
    ['SENIOR', 'Sênior', 3, 119.9, 1, 1, 0, 60, { idadeMinima: 60 }, '#7C3AED', 'Cuidado contínuo para quem tem 60+ anos.'],
  ]) {
    planos[codigo] = ins('planos', {
      tenantId: t1.id, codigo, nome, descricao, nivel, corDestaque: cor, valorMensalidade: valor, valorAdesao: 0,
      valorDependenteAdicional: adicional, dependentesInclusos: incl, maxDependentes: max, carenciaPadraoDias: carencia,
      fidelidadeMeses: 0, publicado: true, ativo: true, ...extra,
    });
  }
  const P = ['BRONZE', 'PRATA', 'OURO', 'FAMILIA', 'SENIOR'];
  const regraCat = (plano, categoria, tipoRegra, valor, extra = {}) =>
    ins('planoBeneficios', {
      tenantId: t1.id, planoId: planos[plano].id, itemCatalogoId: null, categoria, tipoRegra, valor, carenciaDias: null,
      limiteQuantidade: null, periodicidadeLimite: null, abrangencia: 'TODAS', aplicaDependentes: true, prioridade: 0, ativo: true, ...extra,
    });
  const regraItem = (plano, codigoItem, tipoRegra, valor, extra = {}) =>
    regraCat(plano, null, tipoRegra, valor, { itemCatalogoId: itens[codigoItem].id, prioridade: 10, ...extra });

  const matriz = {
    CONSULTA: [['DESCONTO_PERCENTUAL', 30], ['COPARTICIPACAO_VALOR', 40], ['DESCONTO_PERCENTUAL', 50], ['DESCONTO_PERCENTUAL', 50], ['COPARTICIPACAO_VALOR', 30]],
    EXAME_LABORATORIAL: [['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 35], ['DESCONTO_PERCENTUAL', 50], ['DESCONTO_PERCENTUAL', 50], ['DESCONTO_PERCENTUAL', 50]],
    EXAME_IMAGEM: [['DESCONTO_PERCENTUAL', 15], ['DESCONTO_PERCENTUAL', 25], ['DESCONTO_PERCENTUAL', 40], ['DESCONTO_PERCENTUAL', 35], ['DESCONTO_PERCENTUAL', 40]],
    ODONTOLOGIA: [['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 30], ['DESCONTO_PERCENTUAL', 40], ['DESCONTO_PERCENTUAL', 40], ['DESCONTO_PERCENTUAL', 30]],
    FARMACIA: [['DESCONTO_PERCENTUAL', 10], ['DESCONTO_PERCENTUAL', 15], ['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 25]],
    VACINA: [['DESCONTO_PERCENTUAL', 10], ['DESCONTO_PERCENTUAL', 15], ['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 25]],
    TERAPIA: [['DESCONTO_PERCENTUAL', 20], ['DESCONTO_PERCENTUAL', 30], ['DESCONTO_PERCENTUAL', 40], ['DESCONTO_PERCENTUAL', 40], ['COPARTICIPACAO_PERCENTUAL', 30]],
    CIRURGIA_ELETIVA: [null, ['DESCONTO_PERCENTUAL', 10], ['DESCONTO_PERCENTUAL', 15], ['DESCONTO_PERCENTUAL', 15], ['DESCONTO_PERCENTUAL', 20]],
    PRONTO_ATENDIMENTO: [['COPARTICIPACAO_VALOR', 150], ['COPARTICIPACAO_VALOR', 100], ['COPARTICIPACAO_VALOR', 60], ['COPARTICIPACAO_VALOR', 80], ['COPARTICIPACAO_VALOR', 60]],
  };
  for (const [categoria, linhas] of Object.entries(matriz)) {
    linhas.forEach((regra, i) => {
      if (!regra) return;
      const extra = {};
      if (categoria === 'CIRURGIA_ELETIVA') extra.carenciaDias = 180;
      if (categoria === 'PRONTO_ATENDIMENTO') extra.abrangencia = 'PROPRIA';
      regraCat(P[i], categoria, regra[0], regra[1], extra);
    });
  }
  regraItem('OURO', 'CON-CLIN', 'INCLUSO', 0, { limiteQuantidade: 2, periodicidadeLimite: 'MES', abrangencia: 'PROPRIA' });
  regraItem('FAMILIA', 'CON-CLIN', 'INCLUSO', 0, { limiteQuantidade: 4, periodicidadeLimite: 'MES', abrangencia: 'PROPRIA' });
  regraItem('FAMILIA', 'CON-PED', 'INCLUSO', 0, { limiteQuantidade: 2, periodicidadeLimite: 'MES', abrangencia: 'TODAS' });
  regraItem('SENIOR', 'CON-CARD', 'INCLUSO', 0, { limiteQuantidade: 1, periodicidadeLimite: 'MES', abrangencia: 'TODAS', aplicaDependentes: false });
  regraItem('OURO', 'ODO-PROF', 'INCLUSO', 0, { limiteQuantidade: 2, periodicidadeLimite: 'ANO' });
  regraItem('FAMILIA', 'ODO-PROF', 'INCLUSO', 0, { limiteQuantidade: 2, periodicidadeLimite: 'ANO' });
  regraItem('PRATA', 'LAB-HEMO', 'PRECO_FIXO', 15);

  // Estabelecimentos -------------------------------------------------------------
  const est = {};
  const estDefs = [
    ['matriz', 'PROPRIO', 'HOSPITAL', 'Hospital Vida — Matriz', 'Centro', 0, 0, ['PA-CONS', 'CON-CLIN', 'CON-CARD', 'CON-ORT', 'CIR-CATA', 'CIR-VASEC', 'VAC-GRIPE', 'VAC-HPV', 'IMG-ECG'], 'ATIVO'],
    ['ambulatorio', 'PROPRIO', 'CLINICA', 'Ambulatório Vida Aldeota', 'Aldeota', 0.018, 0.021, ['CON-CLIN', 'CON-PED', 'CON-GIN', 'CON-DERM', 'VAC-GRIPE'], 'ATIVO'],
    ['diagnostico', 'PROPRIO', 'CENTRO_IMAGEM', 'Centro de Diagnóstico Vida', 'Fátima', -0.012, 0.008, ['IMG-RXT', 'IMG-USGA', 'IMG-TCC', 'IMG-MAMO', 'IMG-ECG', 'LAB-HEMO', 'LAB-GLIC', 'LAB-LIPI', 'LAB-TSH'], 'ATIVO'],
    ['laboratorio', 'CREDENCIADO', 'LABORATORIO', 'Laboratório Mais Saúde', 'Benfica', -0.008, -0.011, ['LAB-HEMO', 'LAB-GLIC', 'LAB-LIPI', 'LAB-TSH', 'LAB-URINA', 'LAB-CREA', 'LAB-VITD'], 'ATIVO'],
    ['bemviver', 'CREDENCIADO', 'CLINICA', 'Clínica Bem Viver', 'Meireles', 0.026, 0.012, ['CON-CLIN', 'CON-CARD', 'CON-DERM', 'CON-GIN', 'CON-PED', 'CON-NUT'], 'ATIVO'],
    ['drogaria', 'CREDENCIADO', 'FARMACIA', 'Drogaria Vida Leve', 'Centro', 0.004, -0.004, ['FAR-GEN', 'FAR-REF', 'FAR-DERMO'], 'ATIVO'],
    ['pontosaude', 'CREDENCIADO', 'FARMACIA', 'Farmácia Ponto Saúde', 'Messejana', -0.07, 0.04, ['FAR-GEN', 'FAR-REF', 'FAR-DERMO'], 'ATIVO'],
    ['odonto', 'CREDENCIADO', 'CLINICA_ODONTOLOGICA', 'OdontoSorriso Clínica', 'Papicu', 0.022, 0.035, ['ODO-AVAL', 'ODO-PROF', 'ODO-REST', 'ODO-EXO', 'ODO-CANAL', 'ODO-CLAR'], 'ATIVO'],
    ['reabilitacao', 'CREDENCIADO', 'CLINICA', 'Reabilitação Prime', 'Cocó', -0.004, 0.05, ['TER-FISIO', 'CON-ORT'], 'ATIVO'],
    ['saudemental', 'CREDENCIADO', 'CLINICA', 'Núcleo de Saúde Mental Equilíbrio', 'Dionísio Torres', 0.006, 0.026, ['CON-PSI'], 'ATIVO'],
    ['olhar', 'CREDENCIADO', 'CLINICA', 'Clínica Olhar Claro', 'Joaquim Távora', -0.002, 0.018, ['CON-OFT', 'CIR-CATA'], 'ATIVO'],
    ['novaesperanca', 'CREDENCIADO', 'CLINICA', 'Clínica Nova Esperança', 'Montese', -0.035, -0.002, ['CON-CLIN', 'CON-PED'], 'EM_ANALISE'],
  ];
  for (const [chave, natureza, tipo, nome, bairro, dLat, dLon, oferta, status] of estDefs) {
    const e = ins('estabelecimentos', {
      tenantId: t1.id, natureza, tipo, matrizId: null, nome, razaoSocial: `${nome} Ltda (fictícia)`, documento: gerarCnpj(r),
      status, telefone: `8540${r.digitos(6)}`, whatsapp: `8598${r.digitos(7)}`, email: `contato@${chave}.teste`,
      cep: '60' + r.digitos(6), logradouro: r.item(RUAS), numero: String(r.int(10, 3000)), bairro, cidade: 'Fortaleza', uf: 'CE',
      latitude: -3.7319 + dLat, longitude: -38.5267 + dLon,
      horarioFuncionamento: tipo === 'HOSPITAL' ? '24 horas' : tipo === 'FARMACIA' ? 'Seg a sáb, 7h às 22h' : 'Seg a sex, 7h às 19h',
      aceitaAgendamentoOnline: !['FARMACIA', 'HOSPITAL'].includes(tipo), notaMedia: null, totalAvaliacoes: 0,
      contratoInicio: status === 'ATIVO' ? isoDia(addMeses(hoje, -r.int(8, 15))) : null, _oferta: oferta,
      criadoEm: iso(status === 'ATIVO' ? addMeses(hoje, -15) : addDias(hoje, -3)),
    });
    est[chave] = e;
  }
  est.ambulatorio.matrizId = est.matriz.id;
  est.diagnostico.matrizId = est.matriz.id;

  for (const e of Object.values(est)) {
    for (const codigo of e._oferta) {
      const ref = itens[codigo].precoParticularReferencia;
      const fator = e.natureza === 'PROPRIO' ? 0.9 + r.num() * 0.1 : 0.85 + r.num() * 0.3;
      const precoParticular = itens[codigo].categoria === 'FARMACIA' ? 100 : Math.round((ref * fator) / 5) * 5;
      ins('tabelaPrecos', {
        tenantId: t1.id, itemCatalogoId: itens[codigo].id, estabelecimentoId: e.id, precoParticular,
        precoClube: e.natureza === 'CREDENCIADO' && itens[codigo].categoria !== 'FARMACIA' && r.chance(0.2) ? Math.round(precoParticular * 0.45) : null,
        vigenciaInicio: '2025-01-01', vigenciaFim: null,
      });
    }
    delete e._oferta;
  }

  // Regras de repasse ------------------------------------------------------------
  const repasse = (nome, sentido, tipoValor, valor, baseCalculo, extra = {}) =>
    ins('regrasRepasse', {
      tenantId: t1.id, nome, sentido, tipoValor, valor, baseCalculo, estabelecimentoId: null, profissionalId: null,
      categoria: null, itemCatalogoId: null, prioridade: 0, vigenciaInicio: '2025-01-01', vigenciaFim: null, ativa: true, ...extra,
    });
  repasse('Taxa de intermediação padrão', 'PARCEIRO_PAGA_MATRIZ', 'PERCENTUAL', 5, 'VALOR_PAGO');
  repasse('Taxa de intermediação — farmácias', 'PARCEIRO_PAGA_MATRIZ', 'PERCENTUAL', 3, 'VALOR_PAGO', { categoria: 'FARMACIA' });
  repasse('Repasse de serviços inclusos', 'MATRIZ_PAGA_PARCEIRO', 'PERCENTUAL', 60, 'VALOR_ORIGINAL');
  repasse('Repasse limpeza inclusa — OdontoSorriso', 'MATRIZ_PAGA_PARCEIRO', 'VALOR_FIXO', 90, 'VALOR_ORIGINAL', { estabelecimentoId: est.odonto.id, itemCatalogoId: itens['ODO-PROF'].id });
  repasse('Comissão — rede própria', 'MATRIZ_PAGA_PROFISSIONAL', 'PERCENTUAL', 40, 'VALOR_PAGO');
  repasse('Comissão fixa por consulta', 'MATRIZ_PAGA_PROFISSIONAL', 'VALOR_FIXO', 70, 'VALOR_ORIGINAL', { categoria: 'CONSULTA' });

  // Régua de cobrança ------------------------------------------------------------
  for (const [dias, acao, canal, mensagem] of [
    [-3, 'NOTIFICAR', 'WHATSAPP', 'Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}. Pague pelo app com Pix.'],
    [0, 'NOTIFICAR', 'WHATSAPP', '{nome}, sua mensalidade vence hoje. Copie o Pix no app Vida+.'],
    [3, 'GERAR_SEGUNDA_VIA', 'WHATSAPP', '{nome}, identificamos atraso. Geramos a 2ª via com novo Pix.'],
    [15, 'SUSPENDER_BENEFICIOS', 'WHATSAPP', '{nome}, seus benefícios foram suspensos. Regularize para reativar na hora.'],
    [60, 'CANCELAR_ASSINATURA', 'EMAIL', 'Contrato cancelado por inadimplência superior a 60 dias.'],
  ]) ins('reguaEtapas', { tenantId: t1.id, diasRelativoVencimento: dias, acao, canal, mensagem, ativa: true });

  // Profissionais ----------------------------------------------------------------
  const prof = {};
  for (const [chave, nome, sexo, conselho, especialidade, ests, duracao] of [
    ['camila', 'Camila Lopes', 'FEMININO', 'CRM', 'Clínica Médica', ['matriz', 'ambulatorio'], 30],
    ['roberto', 'Roberto Nogueira', 'MASCULINO', 'CRM', 'Cardiologia', ['matriz', 'bemviver'], 30],
    ['helena', 'Helena Duarte', 'FEMININO', 'CRM', 'Pediatria', ['ambulatorio', 'bemviver'], 30],
    ['patricia', 'Patrícia Moura', 'FEMININO', 'CRM', 'Ginecologia e Obstetrícia', ['ambulatorio', 'bemviver'], 30],
    ['marcelo', 'Marcelo Pinheiro', 'MASCULINO', 'CRM', 'Dermatologia', ['bemviver', 'ambulatorio'], 30],
    ['andre', 'André Sales', 'MASCULINO', 'CRM', 'Ortopedia', ['matriz', 'reabilitacao'], 30],
    ['juliana', 'Juliana Freitas', 'FEMININO', 'CRM', 'Oftalmologia', ['olhar'], 30],
    ['beatriz', 'Beatriz Rocha', 'FEMININO', 'CRP', 'Psicologia', ['saudemental'], 50],
    ['felipe', 'Felipe Andrade', 'MASCULINO', 'CREFITO', 'Fisioterapia', ['reabilitacao'], 40],
    ['renata', 'Renata Lima', 'FEMININO', 'CRN', 'Nutrição', ['bemviver'], 40],
    ['larissa', 'Larissa Campos', 'FEMININO', 'CRO', 'Odontologia — Clínico Geral', ['odonto'], 40],
    ['thiago', 'Thiago Barros', 'MASCULINO', 'CRO', 'Endodontia', ['odonto'], 60],
  ]) {
    const titulo = ['CRM', 'CRO'].includes(conselho) ? (sexo === 'FEMININO' ? 'Dra.' : 'Dr.') : '';
    const p = ins('profissionais', {
      tenantId: t1.id, nome, nomeExibicao: `${titulo} ${nome}`.trim(), conselho, numeroConselho: String(r.int(4000, 29999)), ufConselho: 'CE',
      sexo, especialidadeIds: [esp[especialidade].id], estabelecimentoIds: ests.map((k) => est[k].id),
      miniCurriculo: `${especialidade}. Atua há ${r.int(5, 22)} anos com foco em atendimento humanizado.`,
      atendeTeleconsulta: r.chance(0.3), ativo: true, notaMedia: null, totalAvaliacoes: 0,
    });
    prof[chave] = p;
    const turnos = [['08:00', '12:00'], ['13:00', '17:00']];
    ests.forEach((k, i) => {
      const dias = i === 0 ? [1, 3, 5] : [2, 4];
      for (const dia of dias) {
        const [inicio, fim] = turnos[(dia + i) % 2];
        ins('gradesAgenda', {
          tenantId: t1.id, profissionalId: p.id, estabelecimentoId: est[k].id, especialidadeId: esp[especialidade].id,
          diaSemana: dia, horaInicio: inicio, horaFim: fim, duracaoMinutos: duracao, permiteAgendamentoOnline: true,
          vigenciaInicio: '2025-01-01', vigenciaFim: null,
        });
      }
    });
  }

  // Acessos ----------------------------------------------------------------------
  await criarMembro(t1, { email: 'admin@hospitalvida.teste', nome: 'Carla Menezes', papel: 'ADMIN_HOSPITAL' });
  await criarMembro(t1, { email: 'financeiro@hospitalvida.teste', nome: 'Eduardo Paiva', papel: 'FINANCEIRO' });
  await criarMembro(t1, { email: 'recepcao@hospitalvida.teste', nome: 'Sônia Ribeiro', papel: 'RECEPCAO' });
  const mClinica = await criarMembro(t1, { email: 'clinica@hospitalvida.teste', nome: 'Fábio Teixeira', papel: 'PARCEIRO_GESTOR', estabelecimentoId: est.bemviver.id });
  const mLab = await criarMembro(t1, { email: 'laboratorio@hospitalvida.teste', nome: 'Rita Fontenele', papel: 'PARCEIRO_GESTOR', estabelecimentoId: est.laboratorio.id });
  const mFarm = await criarMembro(t1, { email: 'farmacia@hospitalvida.teste', nome: 'Joana Prado', papel: 'FARMACIA_BALCAO', estabelecimentoId: est.drogaria.id });
  const mOdonto = await criarMembro(t1, { email: 'odonto@hospitalvida.teste', nome: 'Larissa Campos', papel: 'DENTISTA', estabelecimentoId: est.odonto.id, profissionalId: prof.larissa.id });
  await criarMembro(t1, { email: 'novaesperanca@hospitalvida.teste', nome: 'Otávio Brito', papel: 'PARCEIRO_GESTOR', estabelecimentoId: est.novaesperanca.id, status: 'PENDENTE_APROVACAO' });
  const membroDoEst = { [est.bemviver.id]: mClinica.id, [est.laboratorio.id]: mLab.id, [est.drogaria.id]: mFarm.id, [est.odonto.id]: mOdonto.id };

  // Associados -------------------------------------------------------------------
  const contratos = [];
  // Associada de demonstração (login do app)
  const mariana = criarPessoa(t1, { nome: 'Mariana Alves Costa', sexo: 'FEMININO', nascimento: new Date(Date.UTC(1988, 3, 12)), cpf: '52998224725' });
  mariana.email = 'cliente@hospitalvida.teste';
  mariana.celular = '85999990001';
  const depsMariana = [
    ['Rafael Alves Costa', 'MASCULINO', Date.UTC(1986, 8, 3), 'CONJUGE'],
    ['Lucas Alves Costa', 'MASCULINO', Date.UTC(2015, 1, 20), 'FILHO'],
    ['Sofia Alves Costa', 'FEMININO', Date.UTC(2019, 6, 8), 'FILHO'],
  ].map(([nome, sexo, nasc, parentesco]) => {
    const p = criarPessoa(t1, { nome, sexo, nascimento: new Date(nasc), parentesco });
    p._parentesco = parentesco;
    return p;
  });
  const cMariana = criarContrato(t1, ctx1, {
    titular: mariana, dependentes: depsMariana, plano: planos.FAMILIA, status: 'ATIVA', inicio: addMeses(inicioMes(hoje), -13),
    diaVencimento: 10, metodo: 'PIX', canal: 'APP', prefixo: 'VID',
  });
  contratos.push(cMariana);
  await criarMembro(t1, { email: 'cliente@hospitalvida.teste', nome: mariana.nome, papel: 'ASSOCIADO', pessoaId: mariana.id });

  const pesosPlano = [['BRONZE', 25], ['PRATA', 30], ['OURO', 20], ['FAMILIA', 15], ['SENIOR', 10]];
  const sortearPlano = () => {
    let x = r.int(1, 100);
    for (const [c, p] of pesosPlano) if ((x -= p) <= 0) return c;
    return 'PRATA';
  };
  const sortearStatus = () => {
    const x = r.num();
    return x < 0.75 ? 'ATIVA' : x < 0.85 ? 'INADIMPLENTE' : x < 0.9 ? 'SUSPENSA' : x < 0.97 ? 'CANCELADA' : 'PENDENTE_ATIVACAO';
  };

  for (let i = 0; i < 140; i++) {
    const codigoPlano = sortearPlano();
    const plano = planos[codigoPlano];
    const sexo = r.chance(0.55) ? 'FEMININO' : 'MASCULINO';
    const sobrenomes = `${r.item(SOBRENOMES)} ${r.item(SOBRENOMES)}`;
    const titular = criarPessoa(t1, {
      nome: nomeAleatorio(sexo, sobrenomes), sexo,
      nascimento: codigoPlano === 'SENIOR' ? nascimentoAleatorio(60, 82) : nascimentoAleatorio(22, 58),
    });
    const nDeps = Math.min(plano.maxDependentes, codigoPlano === 'FAMILIA' ? r.int(2, 4) : r.int(0, 2));
    const dependentes = [];
    for (let d = 0; d < nDeps; d++) {
      const conjuge = d === 0 && r.chance(0.6) && codigoPlano !== 'SENIOR';
      const sx = conjuge ? (sexo === 'FEMININO' ? 'MASCULINO' : 'FEMININO') : r.chance(0.5) ? 'FEMININO' : 'MASCULINO';
      const parentesco = conjuge ? 'CONJUGE' : codigoPlano === 'SENIOR' ? 'CONJUGE' : 'FILHO';
      const p = criarPessoa(t1, {
        nome: nomeAleatorio(sx, conjuge ? `${r.item(SOBRENOMES)} ${sobrenomes.split(' ')[1]}` : sobrenomes), sexo: sx,
        nascimento: parentesco === 'CONJUGE' ? nascimentoAleatorio(codigoPlano === 'SENIOR' ? 60 : 24, codigoPlano === 'SENIOR' ? 80 : 58) : nascimentoAleatorio(1, 17),
        parentesco,
      });
      p._parentesco = parentesco;
      dependentes.push(p);
    }
    const status = sortearStatus();
    let inicio = addDias(inicioMes(hoje), -r.int(30, 430));
    if (status === 'PENDENTE_ATIVACAO') inicio = addDias(hoje, -r.int(0, 4));
    let diaVencimento = r.item([5, 10, 15, 20, 25]);
    if (status === 'INADIMPLENTE') diaVencimento = Math.min(28, addDias(hoje, -r.int(2, 12)).getUTCDate());
    contratos.push(
      criarContrato(t1, ctx1, {
        titular, dependentes, plano, status, inicio, diaVencimento,
        metodo: r.chance(0.55) ? 'PIX' : r.chance(0.75) ? 'BOLETO' : 'CARTAO_CREDITO',
        canal: r.item(['APP', 'RECEPCAO', 'VENDEDOR', 'SITE', 'WHATSAPP']), prefixo: 'VID',
      }),
    );
  }

  for (const p of T.pessoas.filter((x) => x.tenantId === t1.id && x.email)) {
    for (const finalidade of ['TERMOS_USO', 'POLITICA_PRIVACIDADE', 'TRATAMENTO_DADOS_SAUDE'])
      ins('consentimentos', { tenantId: t1.id, pessoaId: p.id, finalidade, concedido: true, versaoTermo: '2025.1', canal: 'APP', registradoEm: p.criadoEm, revogadoEm: null });
    ins('consentimentos', { tenantId: t1.id, pessoaId: p.id, finalidade: 'COMUNICACAO_WHATSAPP', concedido: r.chance(0.8), versaoTermo: '2025.1', canal: 'APP', registradoEm: p.criadoEm, revogadoEm: null });
  }

  // Uso de benefícios (transações B2B) ------------------------------------------
  const regrasDoPlano = (planoId) => T.planoBeneficios.filter((b) => b.planoId === planoId);
  const preco = (estId, itemId) => T.tabelaPrecos.find((p) => p.estabelecimentoId === estId && p.itemCatalogoId === itemId);
  const ofertas = T.tabelaPrecos.filter((p) => p.tenantId === t1.id && T.estabelecimentos.find((e) => e.id === p.estabelecimentoId).status === 'ATIVO');
  const profPara = (estId, item) =>
    T.profissionais.find((p) => p.estabelecimentoIds.includes(estId) && item.especialidadeId && p.especialidadeIds.includes(item.especialidadeId)) ??
    (item.categoria === 'ODONTOLOGIA' ? prof.larissa : null);

  function registrarUso({ benef, assinatura, oferta, data, valorInformado }) {
    const item = T.itensCatalogo.find((i) => i.id === oferta.itemCatalogoId);
    const estab = T.estabelecimentos.find((e) => e.id === oferta.estabelecimentoId);
    const regra = escolherRegra(regrasDoPlano(assinatura.planoId), item, estab.natureza);
    const desde = regra ? inicioPeriodo(regra.periodicidadeLimite, data, benef.inicioVigencia) : data;
    const usos = regra?.limiteQuantidade
      ? T.transacoes.filter((t) => t.beneficiarioId === benef.id && t.planoBeneficioId === regra.id && t.status === 'CONFIRMADA' && new Date(t.ocorridaEm) >= desde).length
      : 0;
    const calc = calcularBeneficio({ regra, item, preco: oferta, valorInformado, beneficiario: benef, usosNoPeriodo: usos, hoje: data });
    if (!calc.permitido) return null;
    const profissional = ['CONSULTA', 'ODONTOLOGIA', 'TERAPIA'].includes(item.categoria) ? profPara(estab.id, item) : null;
    const rep = calcularRepasses({ regrasRepasse: T.regrasRepasse, estabelecimento: estab, profissionalId: profissional?.id, item, tipoRegra: regra.tipoRegra, valores: calc, hoje: data });
    return ins('transacoes', {
      tenantId: t1.id, codigoAutorizacao: codigoAutorizacao(r), chaveIdempotencia: crypto.randomUUID(),
      beneficiarioId: benef.id, pessoaId: benef.pessoaId, estabelecimentoId: estab.id, profissionalId: profissional?.id ?? null,
      itemCatalogoId: item.id, descricaoItem: item.nome, categoria: item.categoria, planoBeneficioId: regra.id, validacaoId: null,
      origem: item.categoria === 'FARMACIA' ? 'BALCAO_FARMACIA' : item.categoria === 'ODONTOLOGIA' ? 'ODONTOLOGIA' : 'ATENDIMENTO',
      status: 'CONFIRMADA', quantidade: 1, valorOriginal: calc.valorOriginal, valorDesconto: calc.valorDesconto,
      valorPagoBeneficiario: calc.valorPago, valorCoparticipacao: calc.valorCoparticipacao,
      valorRepasseParceiro: rep.valorRepasseParceiro, valorTaxaMatriz: rep.valorTaxaMatriz, valorComissaoProfissional: rep.valorComissaoProfissional,
      regrasAplicadas: { beneficio: { id: regra.id, tipoRegra: regra.tipoRegra, valor: regra.valor }, repasses: rep.aplicadas },
      autorizadaPorMembroId: membroDoEst[estab.id] ?? null, ocorridaEm: iso(data), confirmadaEm: iso(data),
      transacaoOriginalId: null, motivoEstorno: null, loteRepasseId: null, criadoEm: iso(data),
    });
  }

  const ativosElegiveis = contratos.filter((c) => ['ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA'].includes(c.assinatura.status));
  const eventos = [];
  for (let i = 0; i < 520; i++) {
    const c = r.item(ativosElegiveis);
    const benef = r.item(c.benefs);
    const ini = new Date(c.assinatura.inicioVigencia);
    const fim = c.assinatura.canceladaEm ? new Date(c.assinatura.canceladaEm) : c.assinatura.status === 'ATIVA' ? hoje : addDias(hoje, -20);
    const limiteInferior = Math.max(ini.getTime(), addDias(hoje, -180).getTime());
    if (fim.getTime() <= limiteInferior) continue;
    const data = new Date(limiteInferior + r.num() * (fim.getTime() - limiteInferior));
    data.setUTCHours(r.int(11, 21), r.int(0, 59));
    eventos.push({ c, benef, data, oferta: r.item(ofertas) });
  }
  // Uso garantido da família de demonstração
  for (const [k, codigo, dias] of [[0, 'CON-CLIN', 70], [1, 'CON-PED', 52], [0, 'LAB-HEMO', 45], [2, 'ODO-PROF', 38], [0, 'FAR-GEN', 20], [1, 'TER-FISIO', 12], [0, 'IMG-USGA', 6], [3, 'CON-PED', 3]]) {
    const oferta = ofertas.find((o) => o.itemCatalogoId === itens[codigo].id && T.estabelecimentos.find((e) => e.id === o.estabelecimentoId).natureza === (codigo === 'CON-CLIN' ? 'PROPRIO' : 'CREDENCIADO')) ?? ofertas.find((o) => o.itemCatalogoId === itens[codigo].id);
    const data = addDias(hoje, -dias);
    data.setUTCHours(14, 30);
    eventos.push({ c: cMariana, benef: cMariana.benefs[k], data, oferta });
  }
  eventos.sort((a, b) => a.data - b.data);
  for (const ev of eventos) {
    const item = T.itensCatalogo.find((i) => i.id === ev.oferta.itemCatalogoId);
    registrarUso({ benef: ev.benef, assinatura: ev.c.assinatura, oferta: ev.oferta, data: ev.data, valorInformado: item.categoria === 'FARMACIA' ? r.int(25, 320) : undefined });
  }

  // Estornos (≈3%) — nova transação negativa referenciando a original
  for (const t of T.transacoes.filter(() => r.chance(0.03))) {
    t.status = 'ESTORNADA';
    t.motivoEstorno = r.item(['Lançamento em duplicidade', 'Procedimento não realizado', 'Valor digitado incorretamente']);
    const quando = addDias(t.ocorridaEm, 1);
    ins('transacoes', {
      ...t, id: crypto.randomUUID(), codigoAutorizacao: codigoAutorizacao(r), chaveIdempotencia: crypto.randomUUID(), status: 'CONFIRMADA',
      valorOriginal: -t.valorOriginal, valorDesconto: -t.valorDesconto, valorPagoBeneficiario: -t.valorPagoBeneficiario,
      valorCoparticipacao: -t.valorCoparticipacao, valorRepasseParceiro: -t.valorRepasseParceiro, valorTaxaMatriz: -t.valorTaxaMatriz,
      valorComissaoProfissional: -t.valorComissaoProfissional, transacaoOriginalId: t.id, ocorridaEm: iso(quando), confirmadaEm: iso(quando), criadoEm: iso(quando),
    });
  }

  // Lotes de repasse dos meses fechados ------------------------------------------
  for (const e of T.estabelecimentos.filter((x) => x.tenantId === t1.id && x.natureza === 'CREDENCIADO')) {
    for (let m = 4; m >= 1; m--) {
      const ini = addMeses(inicioMes(hoje), -m);
      const fim = addDias(addMeses(ini, 1), -1);
      const doLote = T.transacoes.filter((t) => t.estabelecimentoId === e.id && new Date(t.ocorridaEm) >= ini && new Date(t.ocorridaEm) < addMeses(ini, 1) && t.status !== 'AUTORIZADA');
      if (!doLote.length) continue;
      const soma = (k) => centavos(doLote.reduce((s, t) => s + Number(t[k]), 0));
      const lote = ins('lotesRepasse', {
        tenantId: t1.id, estabelecimentoId: e.id, periodoInicio: isoDia(ini), periodoFim: isoDia(fim), quantidadeTransacoes: doLote.length,
        valorTotalOriginal: soma('valorOriginal'), valorTotalDescontos: soma('valorDesconto'), valorRepasses: soma('valorRepasseParceiro'),
        valorTaxas: soma('valorTaxaMatriz'), valorLiquido: centavos(soma('valorRepasseParceiro') - soma('valorTaxaMatriz')),
        status: m === 1 ? 'APROVADO' : 'PAGO', fechadoEm: iso(addDias(fim, 2)), aprovadoEm: iso(addDias(fim, 4)),
        pagoEm: m === 1 ? null : iso(addDias(fim, 10)), criadoEm: iso(addDias(fim, 2)),
      });
      doLote.forEach((t) => (t.loteRepasseId = lote.id));
    }
  }

  // Agendamentos -----------------------------------------------------------------
  const ocupados = new Set();
  function slotLivre(grade, dia) {
    const [h0, m0] = grade.horaInicio.split(':').map(Number);
    const [h1, m1] = grade.horaFim.split(':').map(Number);
    const total = Math.floor((h1 * 60 + m1 - (h0 * 60 + m0)) / grade.duracaoMinutos);
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const idx = r.int(0, total - 1);
      const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), h0 + 3, m0 + idx * grade.duracaoMinutos));
      const chave = `${grade.profissionalId}|${inicio.toISOString()}`;
      if (!ocupados.has(chave)) {
        ocupados.add(chave);
        return { inicio, fim: new Date(inicio.getTime() + grade.duracaoMinutos * 60_000) };
      }
    }
    return null;
  }
  const gradesT1 = T.gradesAgenda.filter((g) => g.tenantId === t1.id);
  function criarAgendamento({ c, benef, grade, dia, status, origem }) {
    const slot = slotLivre(grade, dia);
    if (!slot) return null;
    const p = T.profissionais.find((x) => x.id === grade.profissionalId);
    const item = T.itensCatalogo.find((i) => i.especialidadeId === grade.especialidadeId) ?? null;
    return ins('agendamentos', {
      tenantId: t1.id, pessoaId: benef.pessoaId, beneficiarioId: benef.id, estabelecimentoId: grade.estabelecimentoId, profissionalId: p.id,
      especialidadeId: grade.especialidadeId, itemCatalogoId: item?.id ?? null, tipo: item?.categoria === 'ODONTOLOGIA' ? 'ODONTOLOGIA' : 'CONSULTA',
      inicio: iso(slot.inicio), fim: iso(slot.fim), status, origem, observacoes: null,
      confirmadoEm: status === 'CONFIRMADO' ? iso(addDias(slot.inicio, -1)) : null, canceladoEm: status === 'CANCELADO' ? iso(addDias(slot.inicio, -2)) : null,
      motivoCancelamento: status === 'CANCELADO' ? 'Paciente solicitou pelo app' : null, criadoEm: iso(addDias(slot.inicio, -r.int(3, 15))),
      _assinaturaId: c.assinatura.id,
    });
  }
  const ativas = contratos.filter((c) => c.assinatura.status === 'ATIVA');
  for (let d = -14; d <= 14; d++) {
    const dia = addDias(hoje, d);
    const gradesDoDia = gradesT1.filter((g) => g.diaSemana === dia.getUTCDay());
    for (const grade of gradesDoDia) {
      for (let k = 0; k < r.int(1, 3); k++) {
        const c = r.item(ativas);
        const status = d < 0 ? r.item(['ATENDIDO', 'ATENDIDO', 'ATENDIDO', 'FALTOU', 'CANCELADO']) : d <= 1 ? r.item(['CONFIRMADO', 'AGENDADO']) : r.item(['AGENDADO', 'AGENDADO', 'CONFIRMADO', 'CANCELADO']);
        criarAgendamento({ c, benef: r.item(c.benefs), grade, dia, status, origem: r.item(['APP', 'APP', 'WHATSAPP', 'RECEPCAO', 'PORTAL']) });
      }
    }
  }
  // Próximos agendamentos da associada de demonstração
  const proximoDia = (diaSemana, aPartir) => {
    let dd = addDias(hoje, aPartir);
    while (dd.getUTCDay() !== diaSemana) dd = addDias(dd, 1);
    return dd;
  };
  const gCard = gradesT1.find((g) => g.profissionalId === prof.roberto.id);
  const gOdonto = gradesT1.find((g) => g.profissionalId === prof.larissa.id);
  criarAgendamento({ c: cMariana, benef: cMariana.benefs[0], grade: gCard, dia: proximoDia(gCard.diaSemana, 2), status: 'CONFIRMADO', origem: 'APP' });
  criarAgendamento({ c: cMariana, benef: cMariana.benefs[2], grade: gOdonto, dia: proximoDia(gOdonto.diaSemana, 5), status: 'AGENDADO', origem: 'APP' });
  T.agendamentos.forEach((a) => delete a._assinaturaId);

  // Avaliações -------------------------------------------------------------------
  for (const t of T.transacoes.filter((x) => x.status === 'CONFIRMADA' && !x.transacaoOriginalId && x.categoria !== 'FARMACIA' && r.chance(0.35))) {
    const nota = r.item([5, 5, 5, 4, 4, 4, 3, 2]);
    ins('avaliacoes', {
      tenantId: t1.id, pessoaId: t.pessoaId, transacaoBeneficioId: t.id, atendimentoId: null, profissionalId: t.profissionalId,
      estabelecimentoId: t.estabelecimentoId, nota, comentario: nota >= 4 ? r.item(COMENTARIOS_BONS) : r.item(COMENTARIOS_MEDIOS),
      anonima: r.chance(0.2), status: 'PUBLICADA', criadoEm: iso(addDias(t.ocorridaEm, r.int(0, 3))),
    });
  }

  // Notificações de exemplo para a associada --------------------------------------
  const proxFatura = T.faturas.find((f) => f.assinaturaId === cMariana.assinatura.id && f.status === 'ABERTA');
  if (proxFatura)
    ins('notificacoes', {
      tenantId: t1.id, canal: 'WHATSAPP', pessoaId: mariana.id, destino: '+5585999990001', status: 'ENTREGUE', faturaId: proxFatura.id,
      conteudo: `Olá Mariana! Sua mensalidade de R$ ${Number(proxFatura.valorTotal).toFixed(2).replace('.', ',')} vence em ${new Date(proxFatura.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
      enviadaEm: iso(addDias(hoje, -1)), criadoEm: iso(addDias(hoje, -1)),
    });

  // ---------------------------------------------------------------------------
  // TENANT 2 — Rede Sorriso (rede odontológica) — demonstra o isolamento
  // ---------------------------------------------------------------------------
  const t2 = ins('tenants', {
    slug: 'rede-sorriso', tipo: 'REDE_ODONTOLOGICA', status: 'ATIVO', razaoSocial: 'Rede Sorriso Odontologia (fictícia)',
    nomeFantasia: 'Rede Sorriso', cnpj: gerarCnpj(r), cidade: 'Fortaleza', prefixo: 'SOR', criadoEm: iso(addMeses(hoje, -8)),
  });
  ins('tenantBranding', {
    tenantId: t2.id, nomeApp: 'Sorriso Club', corPrimaria: '#7C3AED', corSecundaria: '#F5F3FF', telefoneEmergencia: '192',
    whatsappSuporte: '85940001111', telefoneCentral: '8540001111', textoBoasVindas: 'Seu sorriso com desconto o ano todo.',
  });
  const ctx2 = { seqContrato: 0, seqFatura: 0 };
  const itens2 = {};
  for (const [codigoInterno, nome, preco] of [['ODO-AVAL', 'Avaliação odontológica', 100], ['ODO-PROF', 'Limpeza (profilaxia)', 160], ['ODO-REST', 'Restauração em resina', 230], ['ODO-ORTO', 'Manutenção ortodôntica', 180]])
    itens2[codigoInterno] = ins('itensCatalogo', { tenantId: t2.id, categoria: 'ODONTOLOGIA', codigoInterno, nome, precoParticularReferencia: preco, especialidadeId: esp['Odontologia — Clínico Geral'].id, exigeAgendamento: true, ativo: true });
  const planos2 = [
    ins('planos', { tenantId: t2.id, codigo: 'ESSENCIAL', nome: 'Sorriso Essencial', descricao: 'Avaliações inclusas e 30% em procedimentos.', nivel: 1, corDestaque: '#7C3AED', valorMensalidade: 29.9, valorAdesao: 0, valorDependenteAdicional: 14.9, dependentesInclusos: 0, maxDependentes: 3, carenciaPadraoDias: 0, fidelidadeMeses: 0, publicado: true, ativo: true }),
    ins('planos', { tenantId: t2.id, codigo: 'TOTAL', nome: 'Sorriso Total', descricao: 'Limpezas inclusas e 50% em procedimentos.', nivel: 2, corDestaque: '#5B21B6', valorMensalidade: 59.9, valorAdesao: 0, valorDependenteAdicional: 19.9, dependentesInclusos: 2, maxDependentes: 4, carenciaPadraoDias: 0, fidelidadeMeses: 0, publicado: true, ativo: true }),
  ];
  planos2.forEach((pl, i) => {
    ins('planoBeneficios', { tenantId: t2.id, planoId: pl.id, itemCatalogoId: null, categoria: 'ODONTOLOGIA', tipoRegra: 'DESCONTO_PERCENTUAL', valor: i ? 50 : 30, abrangencia: 'TODAS', aplicaDependentes: true, prioridade: 0, ativo: true });
    ins('planoBeneficios', { tenantId: t2.id, planoId: pl.id, itemCatalogoId: itens2[i ? 'ODO-PROF' : 'ODO-AVAL'].id, categoria: null, tipoRegra: 'INCLUSO', valor: 0, limiteQuantidade: 2, periodicidadeLimite: 'ANO', abrangencia: 'TODAS', aplicaDependentes: true, prioridade: 10, ativo: true });
  });
  for (const [nome, bairro, dLat, dLon] of [['Sorriso — Unidade Aldeota', 'Aldeota', 0.02, 0.02], ['Sorriso — Unidade Messejana', 'Messejana', -0.07, 0.035]]) {
    const e = ins('estabelecimentos', { tenantId: t2.id, natureza: 'PROPRIO', tipo: 'CLINICA_ODONTOLOGICA', nome, documento: gerarCnpj(r), status: 'ATIVO', bairro, cidade: 'Fortaleza', uf: 'CE', logradouro: r.item(RUAS), numero: String(r.int(10, 999)), latitude: -3.7319 + dLat, longitude: -38.5267 + dLon, telefone: `8540${r.digitos(6)}`, horarioFuncionamento: 'Seg a sáb, 8h às 20h', aceitaAgendamentoOnline: true, totalAvaliacoes: 0 });
    for (const it of Object.values(itens2)) ins('tabelaPrecos', { tenantId: t2.id, itemCatalogoId: it.id, estabelecimentoId: e.id, precoParticular: it.precoParticularReferencia, precoClube: null, vigenciaInicio: '2025-01-01' });
  }
  await criarMembro(t2, { email: 'admin@redesorriso.teste', nome: 'Paula Queiroz', papel: 'ADMIN_HOSPITAL' });
  for (let i = 0; i < 18; i++) {
    const sexo = r.chance(0.5) ? 'FEMININO' : 'MASCULINO';
    const titular = criarPessoa(t2, { nome: nomeAleatorio(sexo), sexo, nascimento: nascimentoAleatorio(20, 60) });
    if (i === 0) titular.email = 'cliente@redesorriso.teste';
    const c = criarContrato(t2, ctx2, { titular, dependentes: [], plano: r.item(planos2), status: i === 0 ? 'ATIVA' : r.chance(0.85) ? 'ATIVA' : 'INADIMPLENTE', inicio: addDias(inicioMes(hoje), -r.int(30, 200)), diaVencimento: r.item([5, 15, 25]), metodo: 'PIX', canal: 'APP', prefixo: 'SOR' });
    if (i === 0) await criarMembro(t2, { email: 'cliente@redesorriso.teste', nome: titular.nome, papel: 'ASSOCIADO', pessoaId: c.assinatura.titularId });
  }

  // ---------------------------------------------------------------------------
  // Médias de avaliação (desnormalizadas, como faria o job no backend)
  // ---------------------------------------------------------------------------
  for (const [tabela, campo] of [['profissionais', 'profissionalId'], ['estabelecimentos', 'estabelecimentoId']]) {
    for (const alvo of T[tabela]) {
      const notas = T.avaliacoes.filter((a) => a[campo] === alvo.id).map((a) => a.nota);
      alvo.totalAvaliacoes = notas.length;
      alvo.notaMedia = notas.length ? centavos(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
    }
  }

  // Auditoria inicial (cadeia de hash por tenant)
  for (const t of [t1, t2]) {
    const linha = { id: 1 + T.logAuditoria.length, tenantId: t.id, atorTipo: 'SISTEMA', usuarioId: null, acao: 'CRIAR', entidade: 'seed', entidadeId: null, dadosDepois: { observacao: 'Carga de dados fictícios' }, criadoEm: iso(hoje), hashAnterior: null };
    linha.hash = await sha256(jsonCanonico(linha));
    T.logAuditoria.push(linha);
  }

  return T;
}
