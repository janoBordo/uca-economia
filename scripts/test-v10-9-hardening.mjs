// Checks e2e de la auditoría v10.9: topes de claves en los records de
// POST /api/db y validación del parámetro tl de /api/tts.
// Uso: node scripts/test-v10-9-hardening.mjs .env.local [http://localhost:3111]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import crypto from "node:crypto";

const envFile = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3111";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const pub = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL"), name, extra); if (!cond) fails++; };

const EMAIL = "v109-hardening@example.com";

// limpieza + usuario de prueba con sesión vía magiclink admin
const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of lista?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id);
await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (lErr) throw new Error(lErr.message);
const { data: v, error: vErr } = await pub().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (vErr) throw new Error(vErr.message);
const tok = v.session.access_token;

const post = (body) => fetch(BASE + "/api/db", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ── Topes de claves en los records (v10.9) ──
const fechas = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const d = new Date(2026, 0, 1 + i);
  const p = (x) => String(x).padStart(2, "0");
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, []];
}));
let r = await post({ planEstudio: fechas(401) });
check("planEstudio con 401 fechas → 400", r.status === 400, `(${r.status})`);
r = await post({ planEstudio: fechas(3) });
check("planEstudio chico → 200", r.status === 200, `(${r.status})`);

const uuids = (n, val) => Object.fromEntries(Array.from({ length: n }, () => [crypto.randomUUID(), val]));
r = await post({ sesiones: uuids(51, 10), _delta: true });
check("sesiones _delta con 51 claves → 400", r.status === 400, `(${r.status})`);
r = await post({ preparacion: uuids(51, 50) });
check("preparacion con 51 claves → 400", r.status === 400, `(${r.status})`);
r = await post({ sesiones: {}, preparacion: {} });
check("reset ({}) sigue andando → 200", r.status === 200, `(${r.status})`);

// ── /api/tts: tl inválido no viaja upstream (cae a "es") ──
const tts = (tl) => fetch(BASE + `/api/tts?q=hola&tl=${encodeURIComponent(tl)}`, {
  headers: { Authorization: `Bearer ${tok}` },
});
r = await tts("es");
check("tts tl=es → 200 audio", r.status === 200 && (r.headers.get("content-type") ?? "").includes("audio"), `(${r.status})`);
r = await tts('xx"><script>&client=zz');
check("tts tl malicioso → no rompe (200 audio, forzado a es)", r.status === 200 && (r.headers.get("content-type") ?? "").includes("audio"), `(${r.status})`);

// limpieza
const { data: lista2 } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of lista2?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id);

console.log(fails ? `\n✘ ${fails} FAIL` : "\n✔ TODO PASS");
process.exit(fails ? 1 : 0);
