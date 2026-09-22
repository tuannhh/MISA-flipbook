/** Ghep manifest.json (kich thuoc/rotation/link tung trang, sinh boi pdf-worker) voi
 * cac dong assets (page_image/thumbnail, sinh boi dispatcher) thanh danh sach trang
 * cho reader. Dung chung cho ca preview (owner) va public reader. */

interface ManifestPage {
  page: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
  links: unknown[];
  media?: ManifestMedia[];
}

interface ManifestMedia {
  kind: "audio" | "video";
  content_type: string;
  path: string;
  rect_norm: number[];
}

interface Manifest {
  pages: ManifestPage[];
}

interface AssetRow {
  id: string;
  kind: string;
  object_key: string;
  content_type?: string;
}

export interface ReaderMedia {
  kind: "audio" | "video";
  contentType: string;
  rectNorm: number[];
  mediaAssetId: string | null;
}

export interface ReaderPage {
  page: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  links: unknown[];
  media: ReaderMedia[];
  imageAssetId: string | null;
  thumbAssetId: string | null;
}

const FILENAME_RE = /page-(\d+)-(thumb|reading)\.\w+$/;

export function buildReaderPages(manifest: Manifest, assetRows: AssetRow[]): ReaderPage[] {
  const byPage = new Map<number, { imageAssetId: string | null; thumbAssetId: string | null }>();
  for (const row of assetRows) {
    const m = FILENAME_RE.exec(row.object_key);
    if (!m) continue;
    const pageNum = Number(m[1]);
    const variant = m[2];
    const entry = byPage.get(pageNum) ?? { imageAssetId: null, thumbAssetId: null };
    if (variant === "reading") {
      entry.imageAssetId = row.id;
    } else {
      entry.thumbAssetId = row.id;
    }
    byPage.set(pageNum, entry);
  }
  const mediaByPath = new Map<string, AssetRow>();
  for (const row of assetRows) {
    if (row.kind !== "media") continue;
    const marker = "/media/";
    const markerIndex = row.object_key.lastIndexOf(marker);
    if (markerIndex >= 0) mediaByPath.set(row.object_key.slice(markerIndex + 1), row);
  }

  return manifest.pages.map((p) => {
    const ids = byPage.get(p.page) ?? { imageAssetId: null, thumbAssetId: null };
    return {
      page: p.page,
      widthPt: p.width_pt,
      heightPt: p.height_pt,
      rotation: p.rotation,
      links: p.links,
      media: (p.media ?? []).flatMap((media) => {
        if (
          (media.kind !== "audio" && media.kind !== "video") ||
          typeof media.content_type !== "string" ||
          typeof media.path !== "string" ||
          !Array.isArray(media.rect_norm) ||
          media.rect_norm.length !== 4 ||
          media.rect_norm.some((value) => typeof value !== "number" || !Number.isFinite(value))
        ) {
          return [];
        }
        const asset = mediaByPath.get(media.path);
        return [
          {
            kind: media.kind,
            contentType: media.content_type,
            rectNorm: media.rect_norm,
            mediaAssetId: asset?.id ?? null,
          },
        ];
      }),
      imageAssetId: ids.imageAssetId,
      thumbAssetId: ids.thumbAssetId,
    };
  });
}
