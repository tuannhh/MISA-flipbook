export interface StorageAdapter {
  /** Luu buffer vao object_key. Key do server sinh (tenant/book/revision), khong
   * bao gio dung ten file nguoi dung upload (ARCHITECTURE.md muc 2). */
  saveBuffer(objectKey: string, data: Buffer): Promise<{ bytes: number }>;
  /** Duong dan tuyet doi tren volume chia se, de dispatcher/pdf-worker doc lai file. */
  getAbsolutePath(objectKey: string): string;
}

export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
