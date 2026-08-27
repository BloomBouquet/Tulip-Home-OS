import type { Home } from "../../../../packages/contracts/src/index.ts";

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function assertHomeOwner(home: Home, currentUserId: string): void {
  if (home.ownerId !== currentUserId) {
    throw new NotFoundError();
  }
}
