import { BadRequestException, Logger, PayloadTooLargeException, ServiceUnavailableException } from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import type { Response } from "express";
import { AuthedRequest } from "./authed-request";

export const PDF_UPLOAD = "pdfUpload";
const MAX_BYTES = Number(process.env.PDF_MAX_BYTES ?? 209715200);
const MAX_ACTIVE = Number(process.env.PDF_UPLOAD_CONCURRENCY ?? 4);
let active = 0;

/** Authentication/ownership preflight must finish before calling this function.
 * Store on the shared volume so adoption is an atomic rename, never a RAM copy. */
export async function withPdfUpload(req: AuthedRequest, res: Response, handler: () => Promise<unknown>) {
  if (active >= MAX_ACTIVE) throw new ServiceUnavailableException("Dang co nhieu file tai len. Vui long thu lai.");
  active++;
  let directory: string | undefined;
  try {
    const root = path.join(process.env.STORAGE_ROOT!, ".uploads");
    await fs.promises.mkdir(root, { recursive: true });
    directory = await fs.promises.mkdtemp(path.join(root, "pdf-"));
    const upload = multer({ dest: directory, limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1 } }).single("file");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => req.destroy(), Number(process.env.PDF_UPLOAD_TIMEOUT_MS ?? 120000));
      upload(req, res, err => {
        clearTimeout(timeout);
        if (!err) return resolve();
        reject(err.code === "LIMIT_FILE_SIZE" ? new PayloadTooLargeException("PDF qua lon.") : new BadRequestException("Upload PDF khong hop le."));
      });
    });
    if (!req.file) throw new BadRequestException("Thieu file PDF (field 'file').");
    const file = await fs.promises.open(req.file.path, "r");
    try {
      const header = Buffer.alloc(5);
      await file.read(header, 0, 5, 0);
      if (!header.equals(Buffer.from("%PDF-"))) throw new BadRequestException("File khong dung dinh dang PDF (sai chu ky %PDF-).");
    } finally { await file.close(); }
    const hash = crypto.createHash("sha256");
    for await (const chunk of fs.createReadStream(req.file.path)) hash.update(chunk);
    req.pdfChecksum = hash.digest("hex");
    return await handler();
  } finally {
    active--;
    if (directory) await fs.promises.rm(directory, { recursive: true, force: true })
      .catch(() => Logger.warn("Khong don duoc thu muc upload tam; can doi soat storage.", "PdfUpload"));
  }
}
