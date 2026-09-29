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
    // Kiem tra cau truc, khong chi tin phan mo rong / Content-Type do client gui (khong dung
    // req.file.originalname/mimetype de quyet dinh gi - ten file khong bao gio di vao duong dan luu).
    //  1) chu ky %PDF-X.Y o dau file;  2) dau hieu ket thuc %%EOF nam trong 1 KiB cuoi
    //     (chan file PDF bi noi them payload phia sau).
    // PDF hop le nhung hong -> pdf-worker (chay sandbox, khong co mang) bao failed o buoc convert.
    const file = await fs.promises.open(req.file.path, "r");
    try {
      const stat = await file.stat();
      const header = Buffer.alloc(16);
      await file.read(header, 0, header.length, 0);
      if (!/^%PDF-[12]\.\d/.test(header.toString("latin1"))) throw new BadRequestException("File khong dung dinh dang PDF (sai chu ky %PDF-).");
      const tailSize = Math.min(1024, stat.size);
      const tail = Buffer.alloc(tailSize);
      await file.read(tail, 0, tailSize, stat.size - tailSize);
      if (!tail.includes(Buffer.from("%%EOF"))) throw new BadRequestException("File PDF khong hop le (thieu dau ket thuc %%EOF).");
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
