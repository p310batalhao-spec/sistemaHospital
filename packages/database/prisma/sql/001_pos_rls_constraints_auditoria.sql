-- =============================================================================
-- Executar DEPOIS das tabelas: anexar ao final da migração inicial.
-- O Prisma não gerencia RLS, CHECK nem triggers — mas também não os remove.
--
-- Papéis de banco:
--   app_tenant      → usado pela API em requisições de tenant. RLS obrigatório.
--   app_plataforma  → Área Master, workers (cobrança, webhooks, sync legado). BYPASSRLS.
--   anon/authenticated (Supabase/PostgREST) → sem acesso: tudo passa pela API NestJS.
-- Senhas dos papéis são definidas fora do versionamento:
--   ALTER ROLE app_tenant PASSWORD '...';
-- =============================================================================

-- 1. Papéis -------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_plataforma') THEN
    CREATE ROLE app_plataforma LOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_tenant, app_plataforma;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant, app_plataforma;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant, app_plataforma;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant, app_plataforma;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_tenant, app_plataforma;

-- O Supabase concede tudo em "public" a anon/authenticated por padrão: revogar.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- 2. Contexto da requisição ---------------------------------------------------
-- A API executa, dentro de cada transação:
--   SELECT set_config('app.tenant_id', '<uuid>', true), set_config('app.usuario_id', '<uuid>', true);
CREATE OR REPLACE FUNCTION app_tenant_atual() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_usuario_atual() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid $$;

-- 3. RLS ----------------------------------------------------------------------
-- 3.1 Toda tabela com tenant_id: isolamento por tenant.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenant_id'
       AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_tenant ON public.%I', t.table_name);
    EXECUTE format(
      'CREATE POLICY isolamento_tenant ON public.%I TO app_tenant
         USING (tenant_id = app_tenant_atual())
         WITH CHECK (tenant_id = app_tenant_atual())',
      t.table_name);
  END LOOP;
END $$;

-- 3.2 tenants: o tenant enxerga apenas o próprio registro (somente leitura).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_proprio ON tenants;
CREATE POLICY tenant_proprio ON tenants FOR SELECT TO app_tenant
  USING (id = app_tenant_atual());

-- 3.3 Catálogos globais: leitura liberada.
ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leitura_global ON especialidades;
CREATE POLICY leitura_global ON especialidades FOR SELECT TO app_tenant USING (true);

ALTER TABLE planos_saas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leitura_global ON planos_saas;
CREATE POLICY leitura_global ON planos_saas FOR SELECT TO app_tenant USING (true);

-- 3.4 usuarios: o próprio usuário + membros do tenant atual. Criação de contas
--     é feita pelo serviço de autenticação com app_plataforma.
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usuarios_leitura ON usuarios;
CREATE POLICY usuarios_leitura ON usuarios FOR SELECT TO app_tenant
  USING (
    id = app_usuario_atual()
    OR EXISTS (SELECT 1 FROM membros m WHERE m.usuario_id = usuarios.id)
  );
DROP POLICY IF EXISTS usuarios_proprio_update ON usuarios;
CREATE POLICY usuarios_proprio_update ON usuarios FOR UPDATE TO app_tenant
  USING (id = app_usuario_atual()) WITH CHECK (id = app_usuario_atual());

-- 3.5 webhook_eventos: exclusivo dos workers.
REVOKE ALL ON webhook_eventos FROM app_tenant;

-- 4. Regras de integridade (CHECK) --------------------------------------------
ALTER TABLE avaliacoes
  ADD CONSTRAINT avaliacoes_nota_ck CHECK (nota BETWEEN 1 AND 5),
  ADD CONSTRAINT avaliacoes_origem_ck CHECK (atendimento_id IS NOT NULL OR transacao_beneficio_id IS NOT NULL),
  ADD CONSTRAINT avaliacoes_alvo_ck CHECK (profissional_id IS NOT NULL OR estabelecimento_id IS NOT NULL);

ALTER TABLE estabelecimentos
  ADD CONSTRAINT estabelecimentos_documento_ck CHECK (documento ~ '^[0-9]{11}$|^[0-9]{14}$');

ALTER TABLE tenants
  ADD CONSTRAINT tenants_cnpj_ck CHECK (cnpj ~ '^[0-9]{14}$');

ALTER TABLE assinaturas
  ADD CONSTRAINT assinaturas_dia_vencimento_ck CHECK (dia_vencimento BETWEEN 1 AND 28);

ALTER TABLE assinaturas_saas
  ADD CONSTRAINT assinaturas_saas_dia_vencimento_ck CHECK (dia_vencimento BETWEEN 1 AND 28);

ALTER TABLE plano_beneficios
  ADD CONSTRAINT plano_beneficios_alvo_ck CHECK (item_catalogo_id IS NOT NULL OR categoria IS NOT NULL),
  ADD CONSTRAINT plano_beneficios_percentual_ck CHECK (
    tipo_regra NOT IN ('DESCONTO_PERCENTUAL', 'COPARTICIPACAO_PERCENTUAL') OR valor BETWEEN 0 AND 100);

ALTER TABLE regras_repasse
  ADD CONSTRAINT regras_repasse_percentual_ck CHECK (tipo_valor <> 'PERCENTUAL' OR valor BETWEEN 0 AND 100);

ALTER TABLE grades_agenda
  ADD CONSTRAINT grades_agenda_horario_ck CHECK (
    dia_semana BETWEEN 0 AND 6 AND hora_fim > hora_inicio AND duracao_minutos > 0);

ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_periodo_ck CHECK (fim > inicio);

ALTER TABLE bloqueios_agenda
  ADD CONSTRAINT bloqueios_agenda_periodo_ck CHECK (fim > inicio);

-- Valores negativos só em estornos (que apontam para a transação original).
ALTER TABLE transacoes_beneficio
  ADD CONSTRAINT transacoes_valores_ck CHECK (
    transacao_original_id IS NOT NULL
    OR (valor_original >= 0 AND valor_desconto >= 0 AND valor_pago_beneficiario >= 0
        AND valor_desconto <= valor_original));

-- Notação FDI: permanentes 11–18, 21–28, 31–38, 41–48; decíduos 51–55 ... 81–85.
CREATE OR REPLACE FUNCTION dente_fdi_valido(d smallint) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS
$$ SELECT d IS NULL
       OR (d / 10 BETWEEN 1 AND 4 AND d % 10 BETWEEN 1 AND 8)
       OR (d / 10 BETWEEN 5 AND 8 AND d % 10 BETWEEN 1 AND 5) $$;

ALTER TABLE odontograma_registros
  ADD CONSTRAINT odontograma_dente_fdi_ck CHECK (dente_fdi_valido(dente));
ALTER TABLE procedimentos_odonto
  ADD CONSTRAINT procedimentos_dente_fdi_ck CHECK (dente_fdi_valido(dente));

-- 5. Imutabilidade --------------------------------------------------------------
CREATE OR REPLACE FUNCTION bloquear_exclusao() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'Registros de "%" não podem ser excluídos (use cancelamento/estorno).', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'registros_clinicos', 'prescricoes', 'atestados', 'solicitacoes_exame', 'resultados_exame',
    'odontograma_registros', 'consentimentos', 'validacoes_elegibilidade',
    'faturas', 'cobrancas', 'transacoes_beneficio', 'lancamentos_financeiros', 'lotes_repasse'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_sem_exclusao', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao()',
      t || '_sem_exclusao', t);
  END LOOP;
END $$;

-- Após assinado, só as colunas passadas como argumento podem mudar
-- (ex.: status para CANCELADO e documento_id quando o PDF é gerado).
CREATE OR REPLACE FUNCTION proteger_documento_assinado() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  permitidas text[] := COALESCE(TG_ARGV::text[], '{}');
BEGIN
  IF OLD.assinado_em IS NOT NULL
     AND (to_jsonb(OLD) - permitidas) IS DISTINCT FROM (to_jsonb(NEW) - permitidas) THEN
    RAISE EXCEPTION 'Documento assinado em "%" não pode ser alterado; emita uma retificação.', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS registros_clinicos_assinado ON registros_clinicos;
CREATE TRIGGER registros_clinicos_assinado BEFORE UPDATE ON registros_clinicos
  FOR EACH ROW EXECUTE FUNCTION proteger_documento_assinado();

DROP TRIGGER IF EXISTS prescricoes_assinado ON prescricoes;
CREATE TRIGGER prescricoes_assinado BEFORE UPDATE ON prescricoes
  FOR EACH ROW EXECUTE FUNCTION proteger_documento_assinado('status', 'documento_id');

DROP TRIGGER IF EXISTS atestados_assinado ON atestados;
CREATE TRIGGER atestados_assinado BEFORE UPDATE ON atestados
  FOR EACH ROW EXECUTE FUNCTION proteger_documento_assinado('status', 'documento_id');

DROP TRIGGER IF EXISTS solicitacoes_exame_assinado ON solicitacoes_exame;
CREATE TRIGGER solicitacoes_exame_assinado BEFORE UPDATE ON solicitacoes_exame
  FOR EACH ROW EXECUTE FUNCTION proteger_documento_assinado('status', 'documento_id');

-- Valores de uma transação B2B nunca mudam depois de gravados; só o ciclo de vida.
CREATE OR REPLACE FUNCTION proteger_transacao_beneficio() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  mutaveis text[] := ARRAY['status', 'confirmada_em', 'lote_repasse_id', 'motivo_estorno'];
BEGIN
  IF (to_jsonb(OLD) - mutaveis) IS DISTINCT FROM (to_jsonb(NEW) - mutaveis) THEN
    RAISE EXCEPTION 'Valores de transacoes_beneficio são imutáveis; registre um estorno.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transacoes_beneficio_imutavel ON transacoes_beneficio;
CREATE TRIGGER transacoes_beneficio_imutavel BEFORE UPDATE ON transacoes_beneficio
  FOR EACH ROW EXECUTE FUNCTION proteger_transacao_beneficio();

-- 6. Trilha de auditoria append-only com encadeamento de hash -------------------
REVOKE UPDATE, DELETE, TRUNCATE ON log_auditoria FROM app_tenant, app_plataforma;

CREATE OR REPLACE FUNCTION bloquear_alteracao_auditoria() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'log_auditoria é append-only (% bloqueado).', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

DROP TRIGGER IF EXISTS log_auditoria_imutavel ON log_auditoria;
CREATE TRIGGER log_auditoria_imutavel BEFORE UPDATE OR DELETE ON log_auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_auditoria();

DROP TRIGGER IF EXISTS log_auditoria_sem_truncate ON log_auditoria;
CREATE TRIGGER log_auditoria_sem_truncate BEFORE TRUNCATE ON log_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_alteracao_auditoria();

-- hash = sha256(hash_anterior || linha). A cadeia é por tenant e deve ser verificada
-- seguindo hash_anterior (a ordem de ids pode divergir sob concorrência).
CREATE OR REPLACE FUNCTION auditoria_encadear_hash() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  anterior text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.tenant_id::text, 'plataforma'), 0));

  SELECT l.hash INTO anterior
    FROM log_auditoria l
   WHERE l.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
   ORDER BY l.id DESC
   LIMIT 1;

  NEW.hash_anterior := anterior;
  NEW.hash := encode(
    sha256(convert_to(COALESCE(anterior, '') || (to_jsonb(NEW) - 'hash' - 'hash_anterior')::text, 'UTF8')),
    'hex');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS log_auditoria_hash ON log_auditoria;
CREATE TRIGGER log_auditoria_hash BEFORE INSERT ON log_auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_encadear_hash();
