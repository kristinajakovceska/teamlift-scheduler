import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { Pool } from 'pg';
import type { PGlite } from '@electric-sql/pglite';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

/**
 * Thin wrapper around PostgreSQL.
 *
 * - With DATABASE_URL set it uses a normal `pg` connection pool (Neon, Supabase, Render...).
 * - Without it, it falls back to PGlite: real Postgres compiled to WASM, persisted to disk,
 *   so the project runs locally with zero setup. Both speak the same SQL and `$1` params.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool?: Pool;
  private lite?: PGlite;

  get driver(): 'postgres' | 'pglite' {
    return this.pool ? 'postgres' : 'pglite';
  }

  async onModuleInit() {
    if (config.databaseUrl) {
      this.pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      mkdirSync(config.pgliteDir, { recursive: true });
      this.lite = new PGlite(config.pgliteDir);
    }

    await this.exec(SCHEMA_SQL);
    this.logger.log(`Connected using ${this.driver}`);
    if (config.seedDemo) await this.seedDemoSlots();
  }

  async onModuleDestroy() {
    await this.pool?.end();
    await this.lite?.close();
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.pool) return (await this.pool.query(sql, params)).rows as T[];
    return (await this.lite!.query<T>(sql, params)).rows;
  }

  /** Runs multi-statement SQL without parameters (used for the schema). */
  private async exec(sql: string) {
    if (this.pool) await this.pool.query(sql);
    else await this.lite!.exec(sql);
  }

  /** Gives a fresh install something to look at: a few slots over the next weekdays. */
  private async seedDemoSlots() {
    const [{ count }] = await this.query<{ count: number }>('SELECT count(*)::int AS count FROM slots');
    if (count > 0) return;

    await this.query(
      `INSERT INTO slots (starts_at, duration_minutes)
       SELECT day + t.time, 30
       FROM generate_series(
              date_trunc('day', now() AT TIME ZONE $1) + interval '1 day',
              date_trunc('day', now() AT TIME ZONE $1) + interval '7 days',
              interval '1 day') AS day,
            (VALUES (time '09:30'), (time '10:00'), (time '14:00'), (time '16:30')) AS t(time)
       WHERE extract(isodow FROM day) < 6`,
      [config.timezone],
    );
    this.logger.log('Seeded demo slots');
  }
}
