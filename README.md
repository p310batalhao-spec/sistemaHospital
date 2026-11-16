# Sistema Elo Saúde

Plataforma SaaS multi-tenant / white label de **clube de benefícios hospitalar**
(cartão de descontos com coparticipação; não é plano de saúde regulado pela ANS).

## Simulador (testar pelo Live Server)

1. Abra a pasta do projeto no VS Code e clique em **Go Live** (extensão Live Server).
2. A página inicial redireciona para `web/` — escolha o portal:
   - `web/admin/` — Painel do Hospital
   - `web/parceiro/` — Portal da Rede Credenciada
   - `web/app/` — App do Beneficiário (PWA; use o modo celular do DevTools)
3. Contas de teste estão listadas na página inicial (senha `123456`).

Tudo roda no navegador: o "backend" simulado (`web/assets/js/backend/`) espelha o schema
Prisma e guarda os dados no localStorage. **Todos os dados são fictícios** e Pix/boletos
são simulados (chave `simulacao@elosaude.invalid`, banco `000`) — nada é pagável.
Use "Restaurar dados de demonstração" na página inicial para recomeçar.

## Estrutura

```
elo-saude/
├─ apps/
│  ├─ api/            NestJS — API única (REST + Swagger), RBAC, workers (BullMQ)
│  ├─ web/            Next.js App Router — todos os painéis via route groups:
│  │                  (master) (hospital) (medico) (odonto) (recepcao) (parceiro)
│  └─ mobile/         Flutter — app do associado (Android, iOS, Web/PWA)
├─ packages/
│  ├─ database/       Prisma: schema por módulo, migrations, SQL de RLS/auditoria
│  ├─ shared/         Tipos, enums, schemas Zod, catálogo de permissões
│  ├─ ui/             Componentes shadcn/ui compartilhados + tokens de tema white label
│  └─ legacy-gateway/ Conectores MySQL / PostgreSQL / SQL Server / Oracle (Knex)
├─ supabase/          config.toml, buckets e seed local (supabase CLI)
├─ infra/             docker-compose (bancos legados de teste), CI/CD
└─ docs/adr/          Decisões de arquitetura
```

## Decisões principais

| Tema | Decisão |
|---|---|
| Multi-tenant | Banco compartilhado, `tenant_id` em todas as tabelas + **RLS** do Postgres |
| Acesso a dados | Flutter e Next.js **só falam com a API NestJS** — PostgREST do Supabase fica fechado |
| Auth | Supabase Auth (JWT) → API resolve `Membro` + papéis do tenant |
| Papéis de banco | `app_tenant` (RLS obrigatório) e `app_plataforma` (Master/workers, BYPASSRLS) |
| Dados sensíveis | CPF/RG/dados bancários e texto clínico cifrados na aplicação (AES-256-GCM); busca por HMAC |
| Auditoria | `log_auditoria` append-only com cadeia de hash; documentos assinados e transações imutáveis |
| Rede própria x credenciada | Um único cadastro `Estabelecimento` (`natureza` PROPRIO/CREDENCIADO) |
| Odontograma | Notação FDI, orientado a eventos (histórico completo de evolução) |

## Banco de dados

```bash
pnpm install
cp packages/database/.env.example packages/database/.env   # preencher
pnpm db:validate
# migração inicial:
cd packages/database
npx prisma migrate dev --create-only --name init
#  → inserir prisma/sql/000_pre_extensoes.sql no TOPO do migration.sql gerado
#  → anexar prisma/sql/001_pos_rls_constraints_auditoria.sql no FINAL
npx prisma migrate dev
```
