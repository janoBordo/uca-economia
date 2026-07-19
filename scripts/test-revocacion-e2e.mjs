// E2E de revocación inmediata (v10.5) contra dev server.
// Verifica que el cambio de GET /api/db (verificación local del JWT + RPC
// get_app_data con chequeo de auth.sessions) conserva EXACTA la garantía
// auditada de Fase 2: "sesión revocada → 401 INMEDIATO", sin ventana de 15
// minutos, aunque el access token siga siendo criptográficamente válido.
// Uso: node scripts/test-revocacion-e2e.mjs .env.local [http://localhost:3000]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envFile = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3000";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const pub = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL"), name, extra); if (!cond) fails++; };

const EMAIL = "rev-logout@example.com";
const EMAIL_DEL = "rev-delete@example.com";

// limpieza de corridas anteriores
const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of lista?.users ?? []) if ([EMAIL, EMAIL_DEL].includes(u.email)) await admin.auth.admin.deleteUser(u.id);

// ── helpers de cookies (mismo patrón que la suite de Fase 2) ──
const jar = new Map();
function guardarCookies(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [par] = sc.split(";");
    const i = par.indexOf("=");
    if (par.slice(i + 1) === "" || /max-age=0/i.test(sc)) jar.delete(par.slice(0, i));
    else jar.set(par.slice(0, i), par.slice(i + 1));
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const req = (path, opts = {}) =>
  fetch(BASE + path, { redirect: "manual", ...opts, headers: { ...(jar.size ? { Cookie: cookieHeader() } : {}), ...(opts.headers ?? {}) } });

// ── 1. Logout con cookies: /api/db corta al instante ──
await admin.auth.admin.createUser({ email: EMAIL, password: "Passw0rdSegura!", email_confirm: true });
const { data: ml } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
let r = await fetch(BASE + `/auth/confirm?token_hash=${ml.properties.hashed_token}&type=magiclink`, { redirect: "manual" });
guardarCookies(r);
check("sesión por cookies creada (/auth/confirm)", jar.size > 0, `(${jar.size} cookies)`);

r = await req("/api/db");
check("GET /api/db con sesión viva → 200", r.status === 200, `(${r.status})`);

const cookiesViejas = cookieHeader();
r = await req("/api/auth/logout", { method: "POST" });
check("logout → 200", r.status === 200, `(${r.status})`);

r = await fetch(BASE + "/api/db", { headers: { Cookie: cookiesViejas } });
check("GET /api/db con cookies viejas (token AÚN válido ~15min) → 401 INMEDIATO", r.status === 401, `(${r.status})`);

// ── 2. Eliminar cuenta (signOut global): Bearer aún válido → 401 ──
await admin.auth.admin.createUser({ email: EMAIL_DEL, password: "Passw0rdSegura!", email_confirm: true });
const { data: ml2 } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL_DEL });
const { data: v } = await pub().auth.verifyOtp({ token_hash: ml2.properties.hashed_token, type: "magiclink" });
const tok = v.session.access_token;

r = await fetch(BASE + "/api/db", { headers: { Authorization: `Bearer ${tok}` } });
check("GET /api/db con Bearer vivo → 200", r.status === 200, `(${r.status})`);

r = await fetch(BASE + "/api/account/delete", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ confirmar: "ELIMINAR MI CUENTA" }),
});
check("eliminar cuenta → 200", r.status === 200, `(${r.status})`);

r = await fetch(BASE + "/api/db", { headers: { Authorization: `Bearer ${tok}` } });
check("GET /api/db tras eliminar cuenta (token aún válido) → 401 INMEDIATO", r.status === 401, `(${r.status})`);

// limpieza final
const { data: lista2 } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of lista2?.users ?? []) if ([EMAIL, EMAIL_DEL].includes(u.email)) await admin.auth.admin.deleteUser(u.id);

console.log(fails === 0 ? "\n✔ TODO PASS" : `\n✘ ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
