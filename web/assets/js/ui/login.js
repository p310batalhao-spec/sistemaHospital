// Tela de login compartilhada (seleção de organização = tenant white label).

import { brandingDoTenant, listarTenants } from '../backend/api.js';
import { CONTAS_DEMO, SENHA_PADRAO } from '../backend/seed.js';
import { esc } from '../lib/util.js';
import { aplicarBranding, btn, cls, comCarregando, dadosForm, icone, opcoes, tratarErro } from './ui.js';

const CHAVE_TENANT = 'elosaude.ultimoTenant';

/**
 * @param {object} o
 * @param {'admin'|'parceiro'|'app'} o.portal
 * @param {string} o.titulo
 * @param {string} o.subtitulo
 * @param {string} [o.rodape] HTML extra abaixo do formulário (links de cadastro etc.)
 * @param {(dados:{tenantSlug,email,senha}) => Promise} o.entrar
 */
export function renderizarLogin(raiz, { portal, titulo, subtitulo, rodape = '', entrar, icone: iconeTopo = 'escudo' }) {
  const tenants = listarTenants();
  let slug = localStorage.getItem(CHAVE_TENANT) ?? tenants[0].slug;
  if (!tenants.some((t) => t.slug === slug)) slug = tenants[0].slug;

  const desenhar = () => {
    const tenant = tenants.find((t) => t.slug === slug);
    aplicarBranding(brandingDoTenant(tenant.id));
    const contas = CONTAS_DEMO.filter((c) => c.portal === portal && c.tenant === slug);
    raiz.innerHTML = `
      <div class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-marca-clara to-white px-4 py-10">
        <div class="w-full max-w-sm">
          <div class="mb-6 text-center">
            <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-marca text-white shadow-lg">${icone(iconeTopo, 'size-7')}</span>
            <p class="mt-4 text-xs font-semibold uppercase tracking-widest text-marca">${esc(tenant.branding.nomeApp)}</p>
            <h1 class="mt-1 text-2xl font-extrabold text-slate-900">${esc(titulo)}</h1>
            <p class="mt-1 text-sm text-slate-500">${esc(subtitulo)}</p>
          </div>
          <form class="${cls.card} space-y-4 p-6" novalidate>
            <label class="block"><span class="${cls.label}">Organização</span>
              <select name="tenantSlug" class="${cls.input}">${opcoes(tenants.map((t) => [t.slug, t.nomeFantasia]), slug)}</select>
            </label>
            <label class="block"><span class="${cls.label}">E-mail</span>
              <input name="email" type="email" autocomplete="username" required class="${cls.input}" placeholder="voce@exemplo.teste" value="${esc(contas[0]?.email ?? '')}">
            </label>
            <label class="block"><span class="${cls.label}">Senha</span>
              <input name="senha" type="password" autocomplete="current-password" required class="${cls.input}" value="${contas.length ? SENHA_PADRAO : ''}">
            </label>
            <p data-erro class="hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"></p>
            <button class="${btn('primario', 'w-full py-2.5')}">Entrar</button>
          </form>
          ${rodape}
          ${contas.length ? `
          <div class="mt-6 rounded-xl bg-white/70 p-4 text-xs text-slate-600 ring-1 ring-slate-200">
            <p class="font-semibold text-slate-700">Contas de teste (senha ${SENHA_PADRAO})</p>
            <ul class="mt-2 space-y-1">${contas.map((c) => `<li><button type="button" data-conta="${esc(c.email)}" class="text-left text-marca hover:underline cursor-pointer">${esc(c.email)}</button> — ${esc(c.papel)}</li>`).join('')}</ul>
          </div>` : ''}
          <p class="mt-6 text-center text-xs text-slate-400"><a class="hover:underline" href="../">← Voltar ao início do simulador</a></p>
        </div>
      </div>`;

    const form = raiz.querySelector('form');
    form.tenantSlug.addEventListener('change', (e) => {
      slug = e.target.value;
      localStorage.setItem(CHAVE_TENANT, slug);
      desenhar();
    });
    raiz.querySelectorAll('[data-conta]').forEach((b) =>
      b.addEventListener('click', () => {
        form.email.value = b.dataset.conta;
        form.senha.value = SENHA_PADRAO;
      }),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const erro = form.querySelector('[data-erro]');
      erro.classList.add('hidden');
      comCarregando(form.querySelector('button:not([type])'), async () => {
        try {
          await entrar(dadosForm(form));
        } catch (err) {
          if (err.status) {
            erro.textContent = err.message;
            erro.classList.remove('hidden');
          } else tratarErro(err);
        }
      });
    });
  };
  desenhar();
}

export const tenantSelecionado = () => localStorage.getItem(CHAVE_TENANT) ?? listarTenants()[0].slug;
