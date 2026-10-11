import { supabase } from "./supabase";

export function documentPath(bucket: string, reference: string) {
  if (!reference.startsWith("https://")) return reference;
  const url = new URL(reference);
  if (url.origin !== "https://favhmbrpisstrwgytapl.supabase.co") throw new Error("Unrecognised document host");
  const prefix = `/storage/v1/object/public/${bucket}/`;
  if (!url.pathname.startsWith(prefix)) throw new Error("Unrecognised document path");
  return decodeURIComponent(url.pathname.slice(prefix.length));
}
export async function privateDocumentUrl(bucket: string, reference: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(documentPath(bucket, reference), 300);
  if (error) throw error;
  return data.signedUrl;
}
export function validateDocument(file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG, WebP or PDF smaller than 5 MB.");
  }
}
