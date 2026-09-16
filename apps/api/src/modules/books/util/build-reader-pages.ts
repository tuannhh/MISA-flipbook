/** Ghep manifest.json (kich thuoc/rotation/link tung trang, sinh boi pdf-worker) voi
 * cac dong assets (page_image/thumbnail, sinh boi dispatcher) thanh danh sach trang
 * cho reader. Dung chung cho ca preview (owner) va public reader. */

interface ManifestPage {
  page: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
  links: unknown[];
}

interface Manifest {
  pages: ManifestPage[];
}

interface AssetRow {
  id: string;
  kind: string;
  object_key: string;
}

export interface ReaderPage {
  page: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  links: unknown[];
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

  return manifest.pages.map((p) => {
    const ids = byPage.get(p.page) ?? { imageAssetId: null, thumbAssetId: null };
    return {
      page: p.page,
      widthPt: p.width_pt,
      heightPt: p.height_pt,
      rotation: p.rotation,
      links: p.links,
      imageAssetId: ids.imageAssetId,
      thumbAssetId: ids.thumbAssetId,
    };
  });
}
