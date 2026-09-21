import { Injectable, BadRequestException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { StorageAdapter } from "./storage.interface";

/**
 * Adapter local cho pilot Docker Compose (ADR-007: doi sang S3-compatible o production
 * ma khong sua logic nghiep vu). Root nam tren volume rieng, KHONG public.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor() {
    const root = process.env.STORAGE_ROOT;
    if (!root) {
      throw new Error("Thieu bien moi truong STORAGE_ROOT.");
    }
    this.root = path.resolve(root);
  }

  private resolveSafe(objectKey: string): string {
    const full = path.resolve(this.root, objectKey);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new BadRequestException("object_key khong hop le.");
    }
    return full;
  }

  async saveBuffer(objectKey: string, data: Buffer): Promise<{ bytes: number }> {
    const full = this.resolveSafe(objectKey);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
    return { bytes: data.length };
  }

  async readBuffer(objectKey: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveSafe(objectKey));
  }

  async adoptFile(objectKey: string, sourcePath: string): Promise<void> {
    const full = this.resolveSafe(objectKey);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.rename(sourcePath, full);
  }

  createReadStream(objectKey: string): fs.ReadStream {
    return fs.createReadStream(this.resolveSafe(objectKey));
  }

  getAbsolutePath(objectKey: string): string {
    return this.resolveSafe(objectKey);
  }
}
