import { ForbiddenException } from "@nestjs/common";
import { AuthedRequest } from "./authed-request";

export function assertAdmin(req: AuthedRequest): void {
  if (!req.isAdmin) {
    throw new ForbiddenException("Chi Admin duoc thao tac o day.");
  }
}
