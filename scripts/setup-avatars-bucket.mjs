// Crea (idempotente) el bucket PRIVADO "avatars" para fotos de perfil (6.17).
// Privado = ningún archivo accesible por URL pública; la app sirve signed URLs
// cortas generadas server-side. Límite de tamaño y MIME whitelist también a
// nivel bucket (defensa en profundidad además de la validación del endpoint).
// Uso: node scripts/setup-avatars-bucket.mjs .env.local
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envFile = process.argv[2] ?? ".env.local";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const opts = {
  public: false,
  fileSizeLimit: 400 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
};

const { data: existente } = await admin.storage.getBucket("avatars");
if (existente) {
  const { error } = await admin.storage.updateBucket("avatars", opts);
  if (error) { console.error("update:", error.message); process.exit(1); }
  console.log("Bucket 'avatars' ya existía — config verificada (privado, 400KB, jpeg/png/webp).");
} else {
  const { error } = await admin.storage.createBucket("avatars", opts);
  if (error) { console.error("create:", error.message); process.exit(1); }
  console.log("Bucket 'avatars' creado (privado, 400KB, jpeg/png/webp).");
}

// Verificación explícita (6.3 — no asumir): el bucket NO debe ser público.
const { data: check } = await admin.storage.getBucket("avatars");
console.log("public:", check.public, "| fileSizeLimit:", check.file_size_limit, "| mimes:", check.allowed_mime_types);
if (check.public) { console.error("¡ATENCIÓN: el bucket quedó público!"); process.exit(1); }
