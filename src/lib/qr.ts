import jsQR from "jsqr";

const BARE_ID = /^DBP-[A-Za-z0-9-]{3,40}$/i;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,40}$/;

/** Pulls a battery ID out of whatever a QR code contained.
 *  Accepts a passport URL on ANY host (https://anything/p/DBP-1234), a bare "/p/DBP-1234"
 *  path, or a bare "DBP-1234". We only ever extract the ID and navigate inside this app —
 *  the host in a scanned URL is never followed. */
export function extractBatteryId(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const u = new URL(text);
    const m = u.pathname.match(/\/p\/([^/]+)\/?$/);
    if (!m) return null;
    const id = decodeURIComponent(m[1]);
    return PATH_ID.test(id) ? id : null;
  } catch {
    /* not an absolute URL — fall through */
  }
  const p = text.match(/^\/?p\/([A-Za-z0-9][A-Za-z0-9_-]{2,40})\/?$/);
  if (p) return p[1];
  return BARE_ID.test(text) ? text.toUpperCase() : null;
}

/** Decode a QR from raw RGBA pixels (works for camera frames and uploaded photos). */
export function decodeQrFromImageData(data: Uint8ClampedArray, width: number, height: number): string | null {
  const code = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return code ? code.data : null;
}

/** Decode a QR from an image file (photo / screenshot) in the browser. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  // Large photos are scaled down: it's faster and jsQR is happier with ~1000px.
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  return decodeQrFromImageData(img.data, w, h);
}