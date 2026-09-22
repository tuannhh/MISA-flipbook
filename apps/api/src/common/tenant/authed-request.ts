import { Request } from "express";
import { PoolClient } from "pg";

export interface AuthedRequest extends Request {
  user?: { sub: string; email: string };
  dbClient: PoolClient;
  isAdmin: boolean;
  tenantId?: string;
  userId: string;
  pdfChecksum?: string;
  uploadContentType?: "image/png" | "image/jpeg" | "image/webp";
  rollbackFiles?: string[];
  afterCommitTasks?: Array<() => Promise<void>>;
}
