import type { BouquetAuthAdapter, BouquetIdentity } from "../../../api/src/auth/bouquet-auth-adapter.ts";
import { BouquetAuthenticationError } from "../../../api/src/auth/bouquet-auth-adapter.ts";
import {
  BouquetOAuthClient,
  InMemoryTransientAuthStore,
  loadBouquetOAuthConfig,
  type BouquetFetch,
  type TransientAuthStore
} from "../../../api/src/auth/bouquet-oauth.ts";
import { BouquetSsoController } from "../../../api/src/auth/bouquet-sso-controller.ts";
import {
  PostgresTransientAuthStore,
  PostgresTulipSessionStore
} from "../../../api/src/auth/postgres-auth-stores.ts";
import {
  InMemoryTulipSessionStore,
  TULIP_SESSION_COOKIE,
  type TulipSessionStore
} from "../../../api/src/auth/tulip-session.ts";
import { HomeManagementService } from "../../../api/src/home/home-management-service.ts";
import { TulipApiRouter, type ApiRequest, type ApiResponse } from "../../../api/src/http/tulip-api-router.ts";
import { HomeItemService } from "../../../api/src/items/item-service.ts";
import { OccurrenceService } from "../../../api/src/occurrences/occurrence-service.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository,
  InMemoryRoutineRepository,
  InMemoryTaskOccurrenceRepository
} from "../../../api/src/persistence/in-memory-repositories.ts";
import { createPgPoolExecutor } from "../../../api/src/persistence/pg-executor.ts";
import {
  PostgresHomeItemRepository,
  PostgresHomeRepository,
  PostgresRoutineRepository,
  PostgresTaskOccurrenceRepository
} from "../../../api/src/persistence/postgres-repositories.ts";
import type {
  HomeItemRepository,
  HomeRepository,
  RoutineRepository,
  TaskOccurrenceRepository
} from "../../../api/src/persistence/repositories.ts";
import { PostgresRegionCatalog } from "../../../api/src/regions/postgres-region-catalog.ts";
import type { RegionCatalogReader } from "../../../api/src/regions/region-catalog.ts";
import { RoutineService } from "../../../api/src/routines/routine-service.ts";
import { RepositoryTodaySource } from "../../../api/src/today/repository-today-source.ts";
import { PostgresWasteScheduleProvider } from "../../../api/src/waste/postgres-waste-provider.ts";
import type { WasteScheduleProvider } from "../../../api/src/waste/waste-provider.ts";

function sessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== TULIP_SESSION_COOKIE) continue;
    const value = valueParts.join("=");
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

class SessionAuthAdapter implements BouquetAuthAdapter {
  private readonly sessions: TulipSessionStore;

  constructor(sessions: TulipSessionStore) {
    this.sessions = sessions;
  }

  async verify(token: string): Promise<BouquetIdentity> {
    const identity = await this.sessions.resolve(token);
    if (!identity) throw new BouquetAuthenticationError("Tulip session is invalid or expired");
    return identity;
  }
}

const emptyWasteProvider: WasteScheduleProvider = {
  async getByRegionAndDate() {
    return [];
  }
};

interface RuntimePersistence {
  homes: HomeRepository;
  routines: RoutineRepository;
  items: HomeItemRepository;
  occurrences: TaskOccurrenceRepository;
  transient: TransientAuthStore;
  sessions: TulipSessionStore;
  regions?: RegionCatalogReader;
  waste: WasteScheduleProvider;
  close(): Promise<void>;
}

function createRuntimePersistence(env: Record<string, string | undefined>): RuntimePersistence {
  const mode = env.TULIP_PERSISTENCE_MODE?.trim().toLowerCase();

  if (mode === "memory") {
    return {
      homes: new InMemoryHomeRepository(),
      routines: new InMemoryRoutineRepository(),
      items: new InMemoryHomeItemRepository(),
      occurrences: new InMemoryTaskOccurrenceRepository(),
      transient: new InMemoryTransientAuthStore(),
      sessions: new InMemoryTulipSessionStore(),
      waste: emptyWasteProvider,
      async close() {}
    };
  }

  if (mode && mode !== "postgres") {
    throw new RangeError("TULIP_PERSISTENCE_MODE must be postgres or memory");
  }

  const sql = createPgPoolExecutor(env.DATABASE_URL);
  return {
    homes: new PostgresHomeRepository(sql),
    routines: new PostgresRoutineRepository(sql),
    items: new PostgresHomeItemRepository(sql),
    occurrences: new PostgresTaskOccurrenceRepository(sql),
    transient: new PostgresTransientAuthStore(sql),
    sessions: new PostgresTulipSessionStore(sql),
    regions: new PostgresRegionCatalog(sql),
    waste: new PostgresWasteScheduleProvider(sql),
    async close() {
      await sql.close();
    }
  };
}

export interface TulipWebRuntime {
  sso: BouquetSsoController;
  handleApi(request: ApiRequest, cookieHeader?: string): Promise<ApiResponse>;
  close(): Promise<void>;
}

export function createTulipWebRuntime(
  env: Record<string, string | undefined>,
  fetcher: BouquetFetch = fetch
): TulipWebRuntime {
  const config = loadBouquetOAuthConfig(env);
  const persistence = createRuntimePersistence(env);
  const { homes, routines, items, occurrences, transient, sessions, regions, waste } = persistence;
  const oauth = new BouquetOAuthClient(config, fetcher);
  const sso = new BouquetSsoController({ config, oauth, transient, sessions });
  const now = () => new Date();
  const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

  const homeService = new HomeManagementService({ homes, regions, now, createId: () => createId("home") });
  const routineService = new RoutineService({ homes, routines, now, createId: () => createId("routine") });
  const itemService = new HomeItemService({ homes, items, now, createId: () => createId("item") });
  const occurrenceService = new OccurrenceService({ homes, routines, items, occurrences, now });
  const todaySource = new RepositoryTodaySource({ routines, items, occurrences, waste });
  const api = new TulipApiRouter({
    auth: new SessionAuthAdapter(sessions),
    homes: homeService,
    routines: routineService,
    items: itemService,
    occurrences: occurrenceService,
    todaySource,
    regions
  });

  return {
    sso,
    async handleApi(request, cookieHeader) {
      const sessionToken = sessionTokenFromCookie(cookieHeader);
      return api.handle({
        ...request,
        headers: {
          ...(request.headers ?? {}),
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {})
        }
      });
    },
    async close() {
      await persistence.close();
    }
  };
}

type RuntimeGlobal = typeof globalThis & { __tulipWebRuntime?: TulipWebRuntime };

function processEnvironment(): Record<string, string | undefined> {
  const processLike = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processLike?.env ?? {};
}

export function getTulipWebRuntime(): TulipWebRuntime {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  if (!runtimeGlobal.__tulipWebRuntime) {
    runtimeGlobal.__tulipWebRuntime = createTulipWebRuntime(processEnvironment());
  }
  return runtimeGlobal.__tulipWebRuntime;
}
