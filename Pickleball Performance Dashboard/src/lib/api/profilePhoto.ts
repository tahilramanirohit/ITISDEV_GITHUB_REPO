import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "profile-photos";
/** Photos are cropped square and shrunk to this size before upload. */
export const PHOTO_SIZE = 512;
const MAX_PICK_BYTES = 25_000_000;
const URL_SECONDS = 3600;
const urlCache = new Map<string, { url: string; expires: number }>();

export class PhotoError extends Error {}

function friendly(message: string): string {
  if (/bucket not found|avatar_path|schema cache/i.test(message)) return "Profile photos are not set up on the server yet. Ask the team to run the latest database update.";
  if (/exceeded|too large|payload/i.test(message)) return "That photo is too large. Try a different one.";
  return message;
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Some browsers (and HEIC files) only decode through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Centre-crops to a square and shrinks to PHOTO_SIZE, as WebP where the browser can encode it, else JPEG. */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new PhotoError("Choose a photo (JPG, PNG or HEIC).");
  if (file.size > MAX_PICK_BYTES) throw new PhotoError("That photo is over 25 MB. Choose a smaller one.");
  let image: CanvasImageSource & { width: number; height: number };
  try { image = await decode(file); } catch { throw new PhotoError("This photo could not be opened. Try a JPG or PNG."); }
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(PHOTO_SIZE, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("This browser cannot prepare the photo.");
  ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new PhotoError("This browser cannot prepare the photo.");
  return { blob: jpeg, ext: "jpg" };
}

/** Uploads a new profile photo, points the profile at it, then removes the old one. Returns the new path. */
export async function uploadProfilePhoto(sb: SupabaseClient, userId: string, file: File, previousPath?: string | null): Promise<string> {
  const { blob, ext } = await shrinkPhoto(file);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const bucket = sb.storage.from(BUCKET);
  const up = await bucket.upload(path, blob, { contentType: ext === "webp" ? "image/webp" : "image/jpeg", upsert: false });
  if (up.error) throw new PhotoError(friendly(up.error.message));
  const { error } = await sb.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) {
    await bucket.remove([path]).catch(() => {});
    throw new PhotoError(friendly(error.message));
  }
  if (previousPath && previousPath !== path) await bucket.remove([previousPath]).catch(() => {});
  return path;
}

export async function removeProfilePhoto(sb: SupabaseClient, userId: string, path: string): Promise<void> {
  const { error } = await sb.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) throw new PhotoError(friendly(error.message));
  urlCache.delete(path);
  await sb.storage.from(BUCKET).remove([path]).catch(() => {});
}

/** Short-lived link to a private photo, reused while it is still valid. */
export async function profilePhotoUrl(sb: SupabaseClient, path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + (URL_SECONDS - 60) * 1000 });
  return data.signedUrl;
}
