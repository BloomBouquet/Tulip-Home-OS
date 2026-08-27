import type {
  Home,
  HomeItem,
  RecurrenceRule,
  Routine,
  TaskOccurrence
} from "../../../../packages/contracts/src/index.ts";
import type {
  HomeItemRepository,
  HomeRepository,
  RoutineRepository,
  TaskOccurrenceRepository
} from "./repositories.ts";

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

interface HomeItemRow extends Record<string, unknown> {
  id: string;
  home_id: string;
  name: string;
  category: HomeItem["category"];
  purchased_at: Date | string | null;
  warranty_ends_at: Date | string | null;
  replacement_interval_days: number | null;
  inspection_interval_days: number | null;
  next_action_at: Date | string | null;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TaskOccurrenceRow extends Record<string, unknown> {
  id: string;
  home_id: string;
  source_type: TaskOccurrence["sourceType"];
  source_id: string;
  title: string;
  due_at: Date | string;
  status: TaskOccurrence["status"];
  completed_at: Date | string | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isHomeOwnerUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const postgresError = error as { code?: unknown; constraint?: unknown };
  return postgresError.code === "23505" && postgresError.constraint === "homes_owner_id_idx";
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

function mapHomeItem(row: HomeItemRow): HomeItem {
  return {
    id: row.id,
    homeId: row.home_id,
    name: row.name,
    category: row.category,
    ...(row.purchased_at !== null ? { purchasedAt: iso(row.purchased_at) } : {}),
    ...(row.warranty_ends_at !== null ? { warrantyEndsAt: iso(row.warranty_ends_at) } : {}),
    ...(row.replacement_interval_days !== null
      ? { replacementIntervalDays: row.replacement_interval_days }
      : {}),
    ...(row.inspection_interval_days !== null
      ? { inspectionIntervalDays: row.inspection_interval_days }
      : {}),
    ...(row.next_action_at !== null ? { nextActionAt: iso(row.next_action_at) } : {}),
    ...(row.note !== null ? { note: row.note } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapTaskOccurrence(row: TaskOccurrenceRow): TaskOccurrence {
  return {
    id: row.id,
    homeId: row.home_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    dueAt: iso(row.due_at),
    status: row.status,
    ...(row.completed_at !== null ? { completedAt: iso(row.completed_at) } : {})
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

    try {
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
    } catch (error) {
      if (isHomeOwnerUniqueViolation(error)) {
        throw new RangeError("Home already exists for this user");
      }
      throw error;
    }
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

export class PostgresHomeItemRepository implements HomeItemRepository {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async findById(id: string): Promise<HomeItem | null> {
    const result = await this.sql.query<HomeItemRow>(
      `SELECT id, home_id, name, category, purchased_at, warranty_ends_at,
              replacement_interval_days, inspection_interval_days, next_action_at,
              note, created_at, updated_at
       FROM home_items
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapHomeItem(result.rows[0]) : null;
  }

  async listByHomeId(homeId: string): Promise<HomeItem[]> {
    const result = await this.sql.query<HomeItemRow>(
      `SELECT id, home_id, name, category, purchased_at, warranty_ends_at,
              replacement_interval_days, inspection_interval_days, next_action_at,
              note, created_at, updated_at
       FROM home_items
       WHERE home_id = $1
       ORDER BY next_action_at ASC NULLS LAST, id ASC`,
      [homeId]
    );
    return result.rows.map(mapHomeItem);
  }

  async save(item: HomeItem): Promise<void> {
    await this.sql.query(
      `INSERT INTO home_items (
         id, home_id, name, category, purchased_at, warranty_ends_at,
         replacement_interval_days, inspection_interval_days, next_action_at,
         note, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         home_id = EXCLUDED.home_id,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         purchased_at = EXCLUDED.purchased_at,
         warranty_ends_at = EXCLUDED.warranty_ends_at,
         replacement_interval_days = EXCLUDED.replacement_interval_days,
         inspection_interval_days = EXCLUDED.inspection_interval_days,
         next_action_at = EXCLUDED.next_action_at,
         note = EXCLUDED.note,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.homeId,
        item.name,
        item.category,
        item.purchasedAt ?? null,
        item.warrantyEndsAt ?? null,
        item.replacementIntervalDays ?? null,
        item.inspectionIntervalDays ?? null,
        item.nextActionAt ?? null,
        item.note ?? null,
        item.createdAt,
        item.updatedAt
      ]
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.sql.query("DELETE FROM home_items WHERE id = $1", [id]);
  }
}

export class PostgresTaskOccurrenceRepository implements TaskOccurrenceRepository {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async findById(id: string): Promise<TaskOccurrence | null> {
    const result = await this.sql.query<TaskOccurrenceRow>(
      `SELECT id, home_id, source_type, source_id, title, due_at, status, completed_at
       FROM task_occurrences
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapTaskOccurrence(result.rows[0]) : null;
  }

  async listByHomeId(homeId: string): Promise<TaskOccurrence[]> {
    const result = await this.sql.query<TaskOccurrenceRow>(
      `SELECT id, home_id, source_type, source_id, title, due_at, status, completed_at
       FROM task_occurrences
       WHERE home_id = $1
       ORDER BY due_at ASC, id ASC`,
      [homeId]
    );
    return result.rows.map(mapTaskOccurrence);
  }

  async listCompletedByHomeId(homeId: string, limit: number): Promise<TaskOccurrence[]> {
    const result = await this.sql.query<TaskOccurrenceRow>(
      `SELECT id, home_id, source_type, source_id, title, due_at, status, completed_at
       FROM task_occurrences
       WHERE home_id = $1
         AND status = 'DONE'
         AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id ASC
       LIMIT $2`,
      [homeId, limit]
    );
    return result.rows.map(mapTaskOccurrence);
  }

  async save(occurrence: TaskOccurrence): Promise<void> {
    await this.sql.query(
      `INSERT INTO task_occurrences (
         id, home_id, source_type, source_id, title, due_at, status, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         home_id = EXCLUDED.home_id,
         source_type = EXCLUDED.source_type,
         source_id = EXCLUDED.source_id,
         title = EXCLUDED.title,
         due_at = EXCLUDED.due_at,
         status = EXCLUDED.status,
         completed_at = EXCLUDED.completed_at`,
      [
        occurrence.id,
        occurrence.homeId,
        occurrence.sourceType,
        occurrence.sourceId,
        occurrence.title,
        occurrence.dueAt,
        occurrence.status,
        occurrence.completedAt ?? null
      ]
    );
  }
}
