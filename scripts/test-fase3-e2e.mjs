// E2E de Fase 3 (datos por-usuario en /api/db + perfil/avatar de la pantalla
// de Cuenta) contra dev server. Crea usuarios de prueba vía admin y los borra
// al final. Uso: node scripts/test-fase3-e2e.mjs .env.local [http://localhost:3111]
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

const EMAIL_A = "f3-usuario-a@example.com";
const EMAIL_B = "f3-usuario-b@example.com";
const PWD = "Passw0rdSegura!";

async function limpiar() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) {
    if ([EMAIL_A, EMAIL_B].includes(u.email)) await admin.auth.admin.deleteUser(u.id);
  }
}
async function sesionDe(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const { data: v, error: vErr } = await pub().auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: "magiclink",
  });
  if (vErr) throw new Error(vErr.message);
  return v.session.access_token;
}
const req = (path, tok, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
const post = (path, tok, body) => req(path, tok, { method: "POST", body: JSON.stringify(body) });

await limpiar();
await admin.auth.admin.createUser({ email: EMAIL_A, password: PWD, email_confirm: true });
await admin.auth.admin.createUser({ email: EMAIL_B, password: PWD, email_confirm: true });
const tokA = await sesionDe(EMAIL_A);
const tokB = await sesionDe(EMAIL_B);

// ── 1. Sin sesión → 401 en todo lo nuevo ──
for (const [m, p] of [["GET", "/api/db"], ["POST", "/api/db"], ["GET", "/api/account/profile"], ["POST", "/api/account/profile"], ["POST", "/api/account/avatar"], ["DELETE", "/api/account/avatar"]]) {
  const r = await req(p, null, { method: m, ...(m === "POST" ? { body: "{}" } : {}) });
  check(`${m} ${p} sin sesión → 401`, r.status === 401, `(${r.status})`);
}

// ── 2. Cuenta nueva arranca vacía ──
let r = await req("/api/db", tokA);
let d = await r.json();
check("GET /api/db cuenta nueva → vacío", r.status === 200 && d.materias.length === 0 && d.notas.length === 0, `(${r.status})`);

// ── 3. Materias: crear, ordenar, roundtrip ──
const m1 = crypto.randomUUID(), m2 = crypto.randomUUID();
r = await post("/api/db", tokA, { materias: [
  { id: m1, nombre: "Micro", examen: "2026-08-10T09:00", metaHoras: 20 },
  { id: m2, nombre: "Macro", examen: "2026-08-20T14:30", metaHoras: 25 },
]});
d = (await r.json()).data;
check("POST materias → 2 en orden", r.status === 200 && d.materias.length === 2 && d.materias[0].nombre === "Micro", `(${r.status})`);
check("examen conserva el formato local", d.materias[0].examen === "2026-08-10T09:00", `(${d.materias[0].examen})`);

// ── 4. add_minutos atómico vía _delta ──
await post("/api/db", tokA, { sesiones: { [m1]: 30 }, _delta: true });
r = await post("/api/db", tokA, { sesiones: { [m1]: 15 }, _delta: true });
d = (await r.json()).data;
check("_delta acumula (30+15=45)", d.sesiones[m1] === 45, `(${d.sesiones[m1]})`);

// ── 5. IDOR: B no puede sumar minutos a la materia de A ni pisarla ──
r = await post("/api/db", tokB, { sesiones: { [m1]: 60 }, _delta: true });
check("_delta con materia ajena → error", r.status !== 200, `(${r.status})`);
r = await post("/api/db", tokB, { materias: [{ id: m1, nombre: "HACKEADA", examen: "", metaHoras: 1 }] });
const dA = await (await req("/api/db", tokA)).json();
check("upsert con id ajeno no pisa la materia de A", dA.materias[0].nombre === "Micro" && dA.sesiones[m1] === 45, `(post=${r.status})`);

// ── 6. Aislación de lectura ──
const dB = await (await req("/api/db", tokB)).json();
check("B no ve datos de A", dB.materias.every(m => m.id !== m1 && m.id !== m2));

// ── 7. Plan de estudio + notas + preparación ──
await post("/api/db", tokA, { planEstudio: { "2026-08-01": [m1], "2026-08-02": [m1, m2] } });
await post("/api/db", tokA, { notas: ["primera nota", "segunda"] });
r = await post("/api/db", tokA, { preparacion: { [m1]: 80, [m2]: 40 } });
d = (await r.json()).data;
check("plan/notas/preparación roundtrip",
  d.planEstudio["2026-08-02"]?.length === 2 && d.notas[0] === "primera nota" && d.preparacion[m1] === 80);

// ── 8. Historial de semestres solo con ?full=1 ──
r = await post("/api/db", tokA, { _archivar: { nombre: "Semestre 1" }, materias: [] });
d = (await r.json()).data;
check("archivar → snapshot con minutos y materias limpias",
  r.status === 200 && d.semestres.length === 1 && d.semestres[0].sesiones[m1] === 45 && d.materias.length === 0);
d = await (await req("/api/db", tokA)).json();
check("GET sin full no trae historial", d.semestres.length === 0);
d = await (await req("/api/db?full=1", tokA)).json();
check("GET ?full=1 trae historial", d.semestres.length === 1 && d.semestres[0].nombre === "Semestre 1");

// ── 9. Validación Zod ──
r = await post("/api/db", tokA, { materias: [{ id: "no-es-uuid", nombre: "x", examen: "", metaHoras: 1 }] });
check("id no-uuid → 400", r.status === 400, `(${r.status})`);
r = await post("/api/db", tokA, { sesiones: { [m1]: 2000 }, _delta: true });
check("_delta > 1440 → 400", r.status === 400, `(${r.status})`);
r = await post("/api/db", tokA, { notas: ["x".repeat(200)] });
check("nota > 144 chars → 400", r.status === 400, `(${r.status})`);
r = await post("/api/db", tokA, { loQueSea: 1 });
check("campo desconocido → 400 (strict)", r.status === 400, `(${r.status})`);

// ── 10. Perfil ──
r = await req("/api/account/profile", tokA);
let perfil = (await r.json()).perfil;
check("perfil default: tema azul, sin foto", r.status === 200 && perfil.temaColor === "azul" && perfil.fotoUrl === null);
r = await post("/api/account/profile", tokA, { nombre: "Jano", apodo: "jano", universidad: "UCA", carrera: "Economía", temaColor: "bordo" });
perfil = (await r.json()).perfil;
check("perfil guarda campos + tema", r.status === 200 && perfil.nombre === "Jano" && perfil.temaColor === "bordo");
r = await post("/api/account/profile", tokA, { temaColor: "fucsia" });
check("tema inválido → 400", r.status === 400, `(${r.status})`);
r = await post("/api/account/profile", tokA, { esAdmin: true });
check("campo desconocido en perfil → 400", r.status === 400, `(${r.status})`);
const perfilB = (await (await req("/api/account/profile", tokB)).json()).perfil;
check("B no ve el perfil de A", perfilB.nombre !== "Jano");

// ── 11. Avatar: tipo real, privacidad, ciclo completo ──
r = await req("/api/account/avatar", tokA, { method: "POST", body: new Uint8Array([0x4d, 0x5a, 1, 2, 3, 4, 5]) });
check("bytes no-imagen (exe) → 415", r.status === 415, `(${r.status})`);
// PNG 1x1 real
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
r = await req("/api/account/avatar", tokA, { method: "POST", body: png });
d = await r.json();
check("PNG válido → 200 + signed URL", r.status === 200 && typeof d.fotoUrl === "string" && d.fotoUrl.includes("token="), `(${r.status})`);
const { data: uA } = await admin.auth.admin.listUsers({ perPage: 200 });
const idA = uA.users.find(u => u.email === EMAIL_A).id;
r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${idA}.png`);
check("bucket privado: URL pública no sirve la foto", r.status !== 200, `(${r.status})`);
r = await fetch(d.fotoUrl);
check("signed URL sí sirve la foto", r.status === 200, `(${r.status})`);
r = await req("/api/account/avatar", tokA, { method: "DELETE" });
perfil = (await (await req("/api/account/profile", tokA)).json()).perfil;
check("quitar foto → perfil sin foto", r.status === 200 && perfil.fotoUrl === null);

// ── 12. Reset de datos (Reiniciar) ──
await post("/api/db", tokA, { materias: [{ id: crypto.randomUUID(), nombre: "Nueva", examen: "", metaHoras: 5 }] });
r = await post("/api/db", tokA, { sesiones: {}, preparacion: {} });
d = (await r.json()).data;
check("reset horas/preparación", Object.keys(d.sesiones).length === 0 && Object.keys(d.preparacion).length === 0);

await limpiar();
console.log(fails === 0 ? "\n✔ TODO PASS" : `\n✘ ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
