import { BadRequestException, Logger, PayloadTooLargeException, ServiceUnavailableException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import type { Response } from "express";
import { AuthedRequest } from "./authed-request";

export const IMAGE_UPLOAD = "imageUpload";
const MAX_BYTES = Number(process.env.SHARE_THUMBNAIL_MAX_BYTES ?? 8 * 1024 * 1024);
const MAX_ACTIVE = Number(process.env.IMAGE_UPLOAD_CONCURRENCY ?? 2);
let active = 0;

function detectImageType(header: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Receive bounded image uploads on disk; never keep a DB transaction open while bytes arrive. */
export async function withImageUpload(req: AuthedRequest, res: Response, handler: () => Promise<unknown>) {
  if (active >= MAX_ACTIVE) throw new ServiceUnavailableException("Dang co nhieu anh tai len. Vui long thu lai.");
  active++;
  let directory: string | undefined;
  try {
    const root = path.join(process.env.STORAGE_ROOT!, ".uploads");
    await fs.promises.mkdir(root, { recursive: true });
    directory = await fs.promises.mkdtemp(path.join(root, "image-"));
    const upload = multer({ dest: directory, limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1 } }).single("file");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => req.destroy(), Number(process.env.IMAGE_UPLOAD_TIMEOUT_MS ?? 60000));
      upload(req, res, (err) => {
        clearTimeout(timeout);
        if (!err) return resolve();
        reject(err.code === "LIMIT_FILE_SIZE" ? new PayloadTooLargeException("Anh qua lon.") : new BadRequestException("Upload anh khong hop le."));
      });
    });
    if (!req.file) throw new BadRequestException("Thieu file anh (field 'file').");
    const header = Buffer.alloc(12);
    const handle = await fs.promises.open(req.file.path, "r");
    try {
      await handle.read(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
    const contentType = detectImageType(header);
    if (!contentType) throw new BadRequestException("Anh chi ho tro PNG, JPEG hoac WebP.");
    req.uploadContentType = contentType;
    return await handler();
  } finally {
    active--;
    if (directory) await fs.promises.rm(directory, { recursive: true, force: true })
      .catch(() => Logger.warn("Khong don duoc thu muc image upload tam; can doi soat storage.", "ImageUpload"));
  }
}
