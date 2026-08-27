import type { Home, RecurrenceRule, Routine } from "../../../../packages/contracts/src/index.ts";
import type { HomeRepository, RoutineRepository } from "./repositories.ts";

export interface SqlQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
}

export interface SqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>>;
}

interface HomeRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  name: string;
  region_code: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RoutineRow extends Record<string, unknown> {
  id: string;
  home_id: string;
  title: string;
  category: Routine["category"];
  recurrence: RecurrenceRule | string;
  next_due_at: Date | string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapHome(row: HomeRow): Home {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    regionCode: row.region_code,
    sido: row.sido,
    sigungu: row.sigungu,
    eupmyeondong: row.eupmyeondong,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapRoutine(row: RoutineRow): Routine {
  const recurrence = typeof row.recurrence === "string"
    ? JSON.parse(row.recurrence) as RecurrenceRule
    : row.recurrence;

  return {
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    category: row.category,
    recurrence,
    nextDueAt: iso(row.next_due_at),
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export class PostgresHomeRepository implements HomeRepository {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async findById(id: string): Promise<Home | null> {
    const result = await this.sql.query<HomeRow>(
      `SELECT id, owner_id, name, region_code, sido, sigungu, eupmyeondong, created_at, updated_at
       FROM homes
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapHome(result.rows[0]) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Home | null> {
    const result = await this.sql.query<HomeRow>(
      `SELECT id, owner_id, name, region_code, sido, sigungu, eupmyeondong, created_at, updated_at
       FROM homes
       WHERE owner_id = $1
       LIMIT 1`,
      [ownerId]
    );
    return result.rows[0] ? mapHome(result.rows[0]) : null;
  }

  async save(home: Home): Promise<void> {
    await this.sql.query(
      `INSERT INTO users (id, bouquet_user_id)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET bouquet_user_id = EXCLUDED.bouquet_user_id`,
      [home.ownerId, home.ownerId]
    );

    await this.sql.query(
      `INSERT INTO homes (
         id, owner_id, name, region_code, sido, sigungu, eupmyeondong, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         name = EXCLUDED.name,
         region_code = EXCLUDED.region_code,
         sido = EXCLUDED.sido,
         sigungu = EXCLUDED.sigungu,
         eupmyeondong = EXCLUDED.eupmyeondong,
         updated_at = EXCLUDED.updated_at`,
      [
        home.id,
        home.ownerId,
        home.name,
        home.regionCode,
        home.sido,
        home.sigungu,
        home.eupmyeondong,
        home.createdAt,
        home.updatedAt
      ]
    );
  }
}

export class PostgresRoutineRepository implements RoutineRepository {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async findById(id: string): Promise<Routine | null> {
    const result = await this.sql.query<RoutineRow>(
      `SELECT id, home_id, title, category, recurrence, next_due_at, is_active, created_at, updated_at
       FROM routines
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapRoutine(result.rows[0]) : null;
  }

  async listByHomeId(homeId: string): Promise<Routine[]> {
    const result = await this.sql.query<RoutineRow>(
      `SELECT id, home_id, title, category, recurrence, next_due_at, is_active, created_at, updated_at
       FROM routines
       WHERE home_id = $1
       ORDER BY next_due_at ASC, id ASC`,
      [homeId]
    );
    return result.rows.map(mapRoutine);
  }

  async save(routine: Routine): Promise<void> {
    await this.sql.query(
      `INSERT INTO routines (
         id, home_id, title, category, recurrence, next_due_at, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         home_id = EXCLUDED.home_id,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         recurrence = EXCLUDED.recurrence,
         next_due_at = EXCLUDED.next_due_at,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at`,
      [
        routine.id,
        routine.homeId,
        routine.title,
        routine.category,
        routine.recurrence,
        routine.nextDueAt,
        routine.isActive,
        routine.createdAt,
        routine.updatedAt
      ]
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.sql.query("DELETE FROM routines WHERE id = $1", [id]);
  }
}
