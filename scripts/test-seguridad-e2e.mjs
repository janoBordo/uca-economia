// E2E de /api/account/change-password y /api/account/delete contra dev server
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envFile = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3111";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SECRET = env.SUPABASE_SECRET_KEEY || env.SUPABASE_SECRET_KEY;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const pub = () => createClient(URL_, ANON, { auth: { persistSession: false } });

const EMAIL = "test-fase1@example.com", PWD1 = "PasswordVieja123", PWD2 = "PasswordNueva456";
let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL"), name, extra); if (!cond) fails++; };

// limpieza previa si quedó de otra corrida
const { data: list } = await admin.auth.admin.listUsers();
for (const u of list?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id);

// 1. crear usuario confirmado
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: EMAIL, password: PWD1, email_confirm: true });
check("crear usuario de prueba", !cErr, cErr?.message ?? "");
const uid = created.user.id;

// perfil auto-creado por trigger
const { data: prof } = await admin.from("profiles").select("id,deleted_at").eq("id", uid).single();
check("trigger crea profile al registrarse", !!prof && prof.deleted_at === null);

// 2. login
const { data: s1, error: sErr } = await pub().auth.signInWithPassword({ email: EMAIL, password: PWD1 });
check("login inicial", !sErr, sErr?.message ?? "");
const token = s1.session.access_token;

const post = (path, body, tok) => fetch(BASE + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
  body: JSON.stringify(body),
});

// 3. change-password sin sesión → 401
let r = await post("/api/account/change-password", { currentPassword: PWD1, newPassword: PWD2 });
check("cambio de contraseña sin sesión → 401", r.status === 401, `(${r.status})`);

// 4. con contraseña actual INCORRECTA → 403
r = await post("/api/account/change-password", { currentPassword: "incorrecta999", newPassword: PWD2 }, token);
check("contraseña actual incorrecta → 403", r.status === 403, `(${r.status})`);

// 5. correcta → 200
r = await post("/api/account/change-password", { currentPassword: PWD1, newPassword: PWD2 }, token);
check("cambio de contraseña correcto → 200", r.status === 200, `(${r.status}) ${await r.clone().text()}`);

// 6. contraseña vieja ya no sirve; la nueva sí
const { error: oldErr } = await pub().auth.signInWithPassword({ email: EMAIL, password: PWD1 });
check("contraseña vieja rechazada", !!oldErr);
const { data: s2, error: newErr } = await pub().auth.signInWithPassword({ email: EMAIL, password: PWD2 });
check("contraseña nueva funciona", !newErr, newErr?.message ?? "");

// 7. rate limit: 5/15min por usuario — ya hicimos 2 con token (pasos 4-5)... hacer hasta que devuelva 429
let got429 = false;
for (let i = 0; i < 6; i++) {
  const rr = await post("/api/account/change-password", { currentPassword: "x".repeat(10), newPassword: "y".repeat(10) }, s2.session.access_token);
  if (rr.status === 429) { got429 = true; break; }
}
check("rate limit de contraseña devuelve 429", got429);

// 8. delete sin confirmación → 400
r = await post("/api/account/delete", {}, s2.session.access_token);
check("delete sin confirmación → 400", r.status === 400, `(${r.status})`);

// 9. delete con confirmación → 200
r = await post("/api/account/delete", { confirmar: "ELIMINAR MI CUENTA" }, s2.session.access_token);
check("delete con confirmación → 200", r.status === 200, `(${r.status}) ${await r.clone().text()}`);

// 10. perfil marcado + login bloqueado (ban) + sesión revocada
const { data: prof2 } = await admin.from("profiles").select("deleted_at").eq("id", uid).single();
check("profiles.deleted_at seteado", !!prof2?.deleted_at);
const { error: banErr } = await pub().auth.signInWithPassword({ email: EMAIL, password: PWD2 });
check("login bloqueado tras eliminar", !!banErr, banErr?.message ?? "");
// el JWT viejo puede seguir siendo válido hasta expirar (diseño de Supabase,
// jwt_exp=900s) — lo que importa es que NO pueda tocar datos: RLS exige
// perfil activo (migración 0002)
const stale = createClient(URL_, ANON, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${s2.session.access_token}` } },
});
const { data: staleProf } = await stale.from("profiles").select("id");
const { data: staleMat } = await stale.from("materias").select("id");
check("token viejo no lee datos tras eliminar (RLS)", (staleProf ?? []).length === 0 && (staleMat ?? []).length === 0);
const { error: staleIns } = await stale.from("materias").insert({ user_id: uid, nombre: "hackeo" });
check("token viejo no escribe datos tras eliminar (RLS)", !!staleIns, staleIns?.message ?? "");

// 11. RLS smoke: anon sin sesión no lee profiles
const { data: anonRead, error: anonErr } = await pub().from("profiles").select("id");
check("anon no lee profiles (RLS)", (anonRead ?? []).length === 0, anonErr?.message ?? "0 filas");

// 12. aislación entre usuarios (EL punto central de la migración):
// A no puede ver/tocar los datos de B ni con IDs adivinados (IDOR)
const mk = async (mail) => {
  const { data } = await admin.auth.admin.createUser({ email: mail, password: "Passw0rdSegura!", email_confirm: true });
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email: mail, password: "Passw0rdSegura!" });
  const cli = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  return { id: data.user.id, cli };
};
const A = await mk("test-fase1-a@example.com");
const B = await mk("test-fase1-b@example.com");
const { data: matA, error: insA } = await A.cli.from("materias").insert({ user_id: A.id, nombre: "Materia de A", meta_horas: 10 }).select().single();
check("A inserta su propia materia", !insA, insA?.message ?? "");
const { data: bLee } = await B.cli.from("materias").select("*");
check("B no ve las materias de A", (bLee ?? []).length === 0);
const { data: bIdor } = await B.cli.from("materias").select("*").eq("id", matA.id);
check("B no lee la materia de A por ID (IDOR)", (bIdor ?? []).length === 0);
const { data: bUpd } = await B.cli.from("materias").update({ nombre: "hackeada" }).eq("id", matA.id).select();
check("B no modifica la materia de A", (bUpd ?? []).length === 0);
const { error: bFalsifica } = await B.cli.from("materias").insert({ user_id: A.id, nombre: "falsa en cuenta de A" });
check("B no inserta datos a nombre de A", !!bFalsifica, bFalsifica?.message ?? "");
const { data: totalA, error: rpcErr } = await A.cli.rpc("add_minutos", { p_materia_id: matA.id, p_delta: 25 });
check("RPC add_minutos suma atómico (A)", !rpcErr && totalA === 25, rpcErr?.message ?? String(totalA));
const { error: rpcB } = await B.cli.rpc("add_minutos", { p_materia_id: matA.id, p_delta: 25 });
check("B no puede sumar minutos a materia de A", !!rpcB, rpcB?.message ?? "");
await admin.auth.admin.deleteUser(A.id);
await admin.auth.admin.deleteUser(B.id);

// cleanup
await admin.auth.admin.deleteUser(uid);
const { data: gone } = await admin.from("profiles").select("id").eq("id", uid);
check("hard delete cascade limpia el profile", (gone ?? []).length === 0);

console.log(fails === 0 ? "TODO OK" : `FALLARON ${fails}`);
process.exit(fails === 0 ? 0 : 1);
