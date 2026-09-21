import type { ReadStream } from "fs";

export interface StorageAdapter {
  /** Luu buffer vao object_key. Key do server sinh (tenant/book/revision), khong
   * bao gio dung ten file nguoi dung upload (ARCHITECTURE.md muc 2). */
  saveBuffer(objectKey: string, data: Buffer): Promise<{ bytes: number }>;
  adoptFile(objectKey: string, sourcePath: string): Promise<void>;
  /** Remove a generated/orphaned object after a failed operation. */
  delete(objectKey: string): Promise<void>;
  /** Doc toan bo file (dung cho file nho nhu manifest.json). */
  readBuffer(objectKey: string): Promise<Buffer>;
  /** Stream file (dung cho anh trang/PDF khi tra ve HTTP response, tranh doc het vao RAM). */
  createReadStream(objectKey: string, options?: { start?: number; end?: number }): ReadStream;
  /** Size is required to implement HTTP byte ranges for audio/video and PDF download. */
  getSize(objectKey: string): Promise<number>;
  /** Duong dan tuyet doi tren volume chia se, de dispatcher/pdf-worker doc lai file. */
  getAbsolutePath(objectKey: string): string;
}

export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
