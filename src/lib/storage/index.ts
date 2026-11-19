import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** Sniff the real type from magic bytes — never trust the client-declared MIME type. */
export function sniffImage(buf: Uint8Array): { ext: string; mime: string } | null {
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  const ascii = (s: number, e: number) => String.fromCharCode(...b.subarray(s, e));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return { ext: "avif", mime: "image/avif" };
  return null; // SVG deliberately unsupported (script injection risk)
}

/**
 * Stores a public image.
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production).
 *  - Local `public/uploads` in development only.
 */
export async function storeImage(buf: Buffer, scope: string): Promise<string> {
  const kind = sniffImage(buf);
  if (!kind) throw new Error("Unsupported image type");
  const name = `${scope}/${randomToken(16)}.${kind.ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`events/${name}`, buf, { access: "public", contentType: kind.mime, addRandomSuffix: false });
    return blob.url;
  }
  if (env.isProduction) throw new Error("Object storage is not configured (BLOB_READ_WRITE_TOKEN)");
  const dir = path.join(process.cwd(), "public", "uploads", scope);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "public", "uploads", name), buf);
  return `/uploads/${name}`;
}
