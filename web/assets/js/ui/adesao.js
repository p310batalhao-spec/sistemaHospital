// Formulário de adesão (titular + dependentes) — painel do hospital e pré-adesão pela rede.

import { esc, fmt } from '../lib/util.js';
import { ROTULO_PARENTESCO, btn, campo, cls, comCarregando, dadosForm, icone, opcoes, tratarErro } from './ui.js';

const opcoesParentesco = (sel = 'FILHO') => opcoes(Object.entries(ROTULO_PARENTESCO), sel);
const opcoesSexo = (sel = '') => opcoes([['', 'Selecione'], ['FEMININO', 'Feminino'], ['MASCULINO', 'Masculino'], ['NAO_INFORMADO', 'Prefiro não informar']], sel);

export function blocoDependente(i) {
  return `<fieldset class="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" data-dep>
    <div class="mb-3 flex items-center justify-between"><legend class="text-sm font-semibold text-slate-700">Dependente ${i + 1}</legend><button type="button" data-remover-dep class="text-xs font-semibold text-red-600 hover:underline cursor-pointer">Remover</button></div>
    <div class="grid gap-3 sm:grid-cols-2">
      ${campo('Nome completo', `<input data-campo="nome" required class="${cls.input}">`)}
      ${campo('Parentesco', `<select data-campo="parentesco" class="${cls.input}">${opcoesParentesco()}</select>`)}
      ${campo('Nascimento', `<input data-campo="dataNascimento" type="date" required class="${cls.input}">`)}
      ${campo('CPF (opcional p/ menores)', `<input data-campo="cpf" inputmode="numeric" class="${cls.input}" placeholder="000.000.000-00">`)}
      ${campo('Sexo', `<select data-campo="sexo" class="${cls.input}">${opcoesSexo()}</select>`)}
    </div></fieldset>`;
}

/** Formulário de adesão reutilizado pelo painel. */
export function formularioAdesao(planos, { textoBotao = 'Criar adesão' } = {}) {
  return `
    <form class="space-y-5" novalidate>
      <div>
        <h3 class="mb-3 text-sm font-bold text-slate-900">Titular</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          ${campo('Nome completo', `<input name="nome" required class="${cls.input}">`)}
          ${campo('CPF', `<input name="cpf" required inputmode="numeric" class="${cls.input}" placeholder="000.000.000-00">`, 'Use um CPF fictício válido. Ex.: gere em um gerador de testes.')}
          ${campo('Nascimento', `<input name="dataNascimento" type="date" required class="${cls.input}">`)}
          ${campo('Sexo', `<select name="sexo" class="${cls.input}">${opcoesSexo()}</select>`)}
          ${campo('Celular (WhatsApp)', `<input name="celular" inputmode="tel" class="${cls.input}" placeholder="(85) 90000-0000">`)}
          ${campo('E-mail', `<input name="email" type="email" class="${cls.input}" placeholder="nome@email.teste">`)}
          ${campo('Bairro', `<input name="bairro" class="${cls.input}">`)}
        </div>
      </div>
      <div>
        <h3 class="mb-3 text-sm font-bold text-slate-900">Plano e cobrança</h3>
        <div class="grid gap-3 sm:grid-cols-3">
          ${campo('Plano', `<select name="planoId" class="${cls.input}">${opcoes(planos.filter((p) => p.ativo).map((p) => [p.id, `${p.nome} — ${fmt.moeda(p.valorMensalidade)}`]))}</select>`)}
          ${campo('Dia de vencimento', `<select name="diaVencimento" class="${cls.input}">${opcoes([5, 10, 15, 20, 25].map((d) => [d, `Dia ${d}`]), 10)}</select>`)}
          ${campo('Forma de pagamento', `<select name="metodo" class="${cls.input}">${opcoes([['PIX', 'Pix'], ['BOLETO', 'Boleto'], ['CARTAO_CREDITO', 'Cartão']])}</select>`)}
        </div>
        <p data-info-plano class="mt-2 text-xs text-slate-500"></p>
      </div>
      <div>
        <div class="mb-3 flex items-center justify-between"><h3 class="text-sm font-bold text-slate-900">Dependentes</h3><button type="button" data-add-dep class="${btn('secundario', 'py-1.5 text-xs')}">${icone('mais', 'size-3.5')} Adicionar</button></div>
        <div data-deps class="space-y-3"></div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" data-fechar class="${btn('secundario')}">Cancelar</button><button class="${btn()}">${esc(textoBotao)}</button></div>
    </form>`;
}

export function ligarFormularioAdesao(form, planos, enviar) {
  const deps = form.querySelector('[data-deps]');
  const info = () => {
    const p = planos.find((x) => x.id === form.planoId.value);
    const n = deps.querySelectorAll('[data-dep]').length;
    if (!p) return;
    const extras = Math.max(0, n - p.dependentesInclusos);
    form.querySelector('[data-info-plano]').textContent = `${p.dependentesInclusos} dependente(s) incluso(s), máximo ${p.maxDependentes}. Mensalidade estimada: ${fmt.moeda(Number(p.valorMensalidade) + extras * Number(p.valorDependenteAdicional || 0))}${p.idadeMinima ? ` · idade mínima ${p.idadeMinima} anos` : ''}${p.carenciaPadraoDias ? ` · carência ${p.carenciaPadraoDias} dias` : ''}.`;
  };
  const renumerar = () => deps.querySelectorAll('legend').forEach((l, i) => (l.textContent = `Dependente ${i + 1}`));
  form.querySelector('[data-add-dep]').addEventListener('click', () => {
    deps.insertAdjacentHTML('beforeend', blocoDependente(deps.children.length));
    info();
  });
  deps.addEventListener('click', (e) => {
    if (!e.target.closest('[data-remover-dep]')) return;
    e.target.closest('[data-dep]').remove();
    renumerar();
    info();
  });
  form.planoId.addEventListener('change', info);
  info();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = dadosForm(form);
    const dependentes = [...deps.querySelectorAll('[data-dep]')].map((f) => Object.fromEntries([...f.querySelectorAll('[data-campo]')].map((i) => [i.dataset.campo, i.value.trim()])));
    comCarregando(form.querySelector('button:not([type])'), () =>
      enviar({ titular: { nome: d.nome, cpf: d.cpf, dataNascimento: d.dataNascimento, sexo: d.sexo, celular: d.celular, email: d.email, bairro: d.bairro }, dependentes, planoId: d.planoId, diaVencimento: d.diaVencimento, metodo: d.metodo }).catch(tratarErro),
    );
  });
}

