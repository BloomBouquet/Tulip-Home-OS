import type { BouquetAuthAdapter, BouquetIdentity } from "../auth/bouquet-auth-adapter.ts";
import { BouquetAuthenticationError } from "../auth/bouquet-auth-adapter.ts";
import type { HomeManagementService } from "../home/home-management-service.ts";
import { NotFoundError } from "../home/home-service.ts";
import type { HomeItemService } from "../items/item-service.ts";
import type { OccurrenceService } from "../occurrences/occurrence-service.ts";
import type { RoutineService } from "../routines/routine-service.ts";
import { buildToday, type TodaySource } from "../today/today-aggregator.ts";

export interface ApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
}

export interface TulipApiRouterDependencies {
  auth: BouquetAuthAdapter;
  homes: HomeManagementService;
  routines: RoutineService;
  items: HomeItemService;
  occurrences: OccurrenceService;
  todaySource: TodaySource;
}

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("request body must be an object");
  }
  return value as Record<string, any>;
}

function bearerToken(headers: Record<string, string | undefined> | undefined): string {
  const raw = headers?.authorization ?? headers?.Authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) throw new BouquetAuthenticationError("Bearer token is required");
  return match[1].trim();
}

function dateFromQuery(value: string | undefined): Date {
  if (value === undefined) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("date must use YYYY-MM-DD");
  const calendarCheck = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== value) {
    throw new RangeError("date must be valid");
  }
  return new Date(`${value}T12:00:00+09:00`);
}

function response(status: number, body?: unknown): ApiResponse {
  return body === undefined ? { status } : { status, body };
}

export class TulipApiRouter {
  private readonly dependencies: TulipApiRouterDependencies;

  constructor(dependencies: TulipApiRouterDependencies) {
    this.dependencies = dependencies;
  }

  private async identity(request: ApiRequest): Promise<BouquetIdentity> {
    return this.dependencies.auth.verify(bearerToken(request.headers));
  }

  async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      const identity = await this.identity(request);
      const method = request.method.toUpperCase();
      const path = request.path.replace(/\/+$/, "") || "/";

      if (method === "GET" && path === "/v1/me") return response(200, identity);
      if (method === "POST" && path === "/v1/homes") return response(201, await this.dependencies.homes.create(identity.userId, asObject(request.body) as any));
      if (method === "GET" && path === "/v1/homes/current") return response(200, await this.dependencies.homes.getCurrent(identity.userId));
      if (method === "PATCH" && path === "/v1/homes/current") return response(200, await this.dependencies.homes.updateCurrent(identity.userId, asObject(request.body) as any));

      if (method === "GET" && path === "/v1/today") {
        const home = await this.dependencies.homes.getCurrent(identity.userId);
        const date = dateFromQuery(request.query?.date);
        return response(200, await buildToday({ homeId: home.id, regionCode: home.regionCode, date }, this.dependencies.todaySource));
      }

      if (path === "/v1/routines") {
        if (method === "POST") return response(201, await this.dependencies.routines.create(identity.userId, asObject(request.body) as any));
        if (method === "GET") {
          const homeId = request.query?.homeId;
          if (!homeId) throw new RangeError("homeId is required");
          return response(200, await this.dependencies.routines.list(identity.userId, homeId));
        }
      }

      const routineMatch = path.match(/^\/v1\/routines\/([^/]+)$/);
      if (routineMatch) {
        const id = decodeURIComponent(routineMatch[1]);
        if (method === "PATCH") return response(200, await this.dependencies.routines.update(identity.userId, id, asObject(request.body) as any));
        if (method === "DELETE") {
          await this.dependencies.routines.delete(identity.userId, id);
          return response(204);
        }
      }

      if (path === "/v1/items") {
        if (method === "POST") return response(201, await this.dependencies.items.create(identity.userId, asObject(request.body) as any));
        if (method === "GET") {
          const homeId = request.query?.homeId;
          if (!homeId) throw new RangeError("homeId is required");
          return response(200, await this.dependencies.items.list(identity.userId, homeId));
        }
      }

      const itemMatch = path.match(/^\/v1\/items\/([^/]+)$/);
      if (itemMatch) {
        const id = decodeURIComponent(itemMatch[1]);
        if (method === "GET") return response(200, await this.dependencies.items.get(identity.userId, id));
        if (method === "PATCH") return response(200, await this.dependencies.items.update(identity.userId, id, asObject(request.body) as any));
        if (method === "DELETE") {
          await this.dependencies.items.delete(identity.userId, id);
          return response(204);
        }
      }

      const occurrenceMatch = path.match(/^\/v1\/occurrences\/([^/]+)\/(complete|undo)$/);
      if (occurrenceMatch && method === "POST") {
        const id = decodeURIComponent(occurrenceMatch[1]);
        return response(200, occurrenceMatch[2] === "complete"
          ? await this.dependencies.occurrences.complete(identity.userId, id)
          : await this.dependencies.occurrences.undo(identity.userId, id));
      }

      if (path === "/v1/history" && method === "GET") {
        const homeId = request.query?.homeId;
        if (!homeId) throw new RangeError("homeId is required");
        const rawLimit = request.query?.limit;
        const limit = rawLimit === undefined ? 50 : Number(rawLimit);
        return response(200, await this.dependencies.occurrences.listHistory(identity.userId, homeId, limit));
      }

      return response(404, { error: "NOT_FOUND" });
    } catch (error) {
      if (error instanceof BouquetAuthenticationError) return response(401, { error: "UNAUTHORIZED" });
      if (error instanceof NotFoundError) return response(404, { error: "NOT_FOUND" });
      if (error instanceof RangeError || error instanceof TypeError) return response(400, { error: "BAD_REQUEST", message: error.message });
      return response(500, { error: "INTERNAL_ERROR" });
    }
  }
}
