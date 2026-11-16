import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

export function criarPrismaClient(connectionString = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export interface ContextoRls {
  tenantId: string;
  usuarioId?: string;
}

/**
 * Executa `fn` numa transação com `app.tenant_id`/`app.usuario_id` definidos, ativando as
 * políticas RLS (prisma/sql/001_pos_rls_constraints_auditoria.sql). O `true` em set_config
 * limita o valor à transação — seguro com o pooler do Supabase em transaction mode.
 */
export async function comTenant<T>(
  prisma: PrismaClient,
  { tenantId, usuarioId = '' }: ContextoRls,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
