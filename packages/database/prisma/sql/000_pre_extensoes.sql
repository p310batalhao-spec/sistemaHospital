-- =============================================================================
-- Executar ANTES das tabelas: inserir no topo da migração inicial.
-- (No Supabase, as extensões ficam no schema "extensions", que já está no search_path.)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector;
