import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// A CLI (migrate/studio) usa a conexão DIRETA do Supabase (porta 5432).
// Em runtime a API usa o pooler (porta 6543) via @prisma/adapter-pg — ver src/index.ts.
export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
