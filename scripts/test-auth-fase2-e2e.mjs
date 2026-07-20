// E2E de Fase 2 (login/registro/recuperación/protección de rutas) contra dev server.
// Uso: node scripts/test-auth-fase2-e2e.mjs .env.local [http://localhost:3111]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envFile = process.argv[2];
const BASE = process.argv[3] || "http://localhost:3111";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, SECRET = env.SUPABASE_SECRET_KEY;
const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL"), name, extra); if (!cond) fails++; };

// ── helpers ──
const jar = new Map(); // cookie jar simple
function guardarCookies(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [par] = sc.split(";");
    const i = par.indexOf("=");
    const name = par.slice(0, i), value = par.slice(i + 1);
    if (value === "" || /max-age=0/i.test(sc)) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const req = (path, opts = {}, conCookies = true) =>
  fetch(BASE + path, {
    redirect: "manual",
    ...opts,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(conCookies && jar.size ? { Cookie: cookieHeader() } : {}),
      ...(opts.headers ?? {}),
    },
  });
const dondeRedirige = (res) => new URL(res.headers.get("location") ?? "/x", BASE).pathname;

// limpieza de usuarios de corridas anteriores
const MAILS = ["f2-flujo@example.com", "f2-bruteforce@example.com", "f2-recovery@example.com"];
const { data: lista } = await admin.auth.admin.listUsers();
for (const u of lista?.users ?? []) if (MAILS.includes(u.email)) await admin.auth.admin.deleteUser(u.id);

// ── 1. Protección de rutas sin sesión ──
let r = await req("/", {}, false);
check("GET / sin sesión → redirect a /login", [302, 307].includes(r.status) && dondeRedirige(r) === "/login", `(${r.status} → ${r.headers.get("location")})`);
r = await req("/timer", {}, false);
check("GET /timer sin sesión → redirect a /login", [302, 307].includes(r.status) && dondeRedirige(r) === "/login");
r = await req("/login", {}, false);
check("GET /login sin sesión → 200", r.status === 200, `(${r.status})`);
r = await req("/registro", {}, false);
check("GET /registro sin sesión → 200", r.status === 200, `(${r.status})`);
r = await req("/recuperar", {}, false);
check("GET /recuperar sin sesión → 200", r.status === 200, `(${r.status})`);

// ── 2. APIs sin sesión → 401 ──
r = await req("/api/db", {}, false);
check("GET /api/db sin sesión → 401", r.status === 401, `(${r.status})`);
r = await req("/api/db", { method: "POST", body: JSON.stringify({ notas: [] }) }, false);
check("POST /api/db sin sesión → 401", r.status === 401, `(${r.status})`);
r = await req("/api/tts?q=hola", {}, false);
check("GET /api/tts sin sesión → 401", r.status === 401, `(${r.status})`);
r = await req("/api/auth/me", {}, false);
check("GET /api/auth/me sin sesión → 401", r.status === 401, `(${r.status})`);

// ── 3. Validación de entrada de los endpoints de auth ──
r = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "no-es-mail", password: "x", captchaToken: "x" }) }, false);
check("login con email inválido → 400", r.status === 400, `(${r.status})`);
r = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.co", password: "loquesea123", captchaToken: "token-falso" }) }, false);
check("login con captcha falso → rechazado (400/401)", [400, 401].includes(r.status), `(${r.status}) ${await r.clone().text()}`);
r = await req("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: "a@b.co", emailConfirm: "otro@b.co", password: "12345678", captchaToken: "x" }) }, false);
check("signup con emails distintos → 400", r.status === 400, `(${r.status})`);
r = await req("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: "a@b.co", emailConfirm: "a@b.co", password: "corta", captchaToken: "x" }) }, false);
check("signup con contraseña corta → 400", r.status === 400, `(${r.status})`);
// Política v10.10: mayúscula + minúscula + número obligatorios
r = await req("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: "a@b.co", emailConfirm: "a@b.co", password: "sinmayuscula1", captchaToken: "x" }) }, false);
check("signup sin mayúscula → 400 (política de contraseñas)", r.status === 400, `(${r.status})`);
r = await req("/api/auth/recover/verify", { method: "POST", body: JSON.stringify({ email: "a@b.co", code: "abc123", newPassword: "12345678" }) }, false);
check("verify con código no numérico → 400", r.status === 400, `(${r.status})`);
r = await req("/api/auth/recover/verify", { method: "POST", body: JSON.stringify({ email: "a@b.co", code: "123456", newPassword: "solominusculas" }) }, false);
check("verify con contraseña débil → 400 (política de contraseñas)", r.status === 400, `(${r.status})`);
r = await req("/api/auth/resend", { method: "POST", body: JSON.stringify({ email: "no-es-mail", captchaToken: "x" }) }, false);
check("resend con email inválido → 400", r.status === 400, `(${r.status})`);

// ── 4. Fuerza bruta del OTP: 5 intentos por email y después 429 ──
await admin.auth.admin.createUser({ email: "f2-bruteforce@example.com", password: "Passw0rdSegura!", email_confirm: true });
let got429 = false, ultimos = [];
for (let i = 0; i < 7; i++) {
  const code = String(100000 + i);
  const rr = await req("/api/auth/recover/verify", { method: "POST", body: JSON.stringify({ email: "f2-bruteforce@example.com", code, newPassword: "NuevaClave123" }) }, false);
  ultimos.push(rr.status);
  if (rr.status === 429) { got429 = true; break; }
}
check("verify: códigos incorrectos → 400 y luego 429 (límite estricto)", got429 && ultimos.slice(0, -1).every(s => s === 400), `(${ultimos.join(",")})`);

// ── 5. Flujo REAL de recuperación por OTP (código generado por Supabase) ──
await admin.auth.admin.createUser({ email: "f2-recovery@example.com", password: "ClaveVieja123", email_confirm: true });
const { data: linkRec, error: lrErr } = await admin.auth.admin.generateLink({ type: "recovery", email: "f2-recovery@example.com" });
check("generar OTP de recuperación (admin)", !lrErr && !!linkRec?.properties?.email_otp, lrErr?.message ?? "");
r = await req("/api/auth/recover/verify", { method: "POST", body: JSON.stringify({ email: "f2-recovery@example.com", code: linkRec.properties.email_otp, newPassword: "ClaveNueva456" }) }, false);
check("verify con código real + clave nueva → 200", r.status === 200, `(${r.status}) ${await r.clone().text()}`);
const pub = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: viejaErr } = await pub().auth.signInWithPassword({ email: "f2-recovery@example.com", password: "ClaveVieja123" });
check("contraseña vieja ya no sirve", !!viejaErr);

// ── 6. Sesión por cookies vía /auth/confirm (token_hash) ──
await admin.auth.admin.createUser({ email: "f2-flujo@example.com", password: "Passw0rdSegura!", email_confirm: true });
const { data: linkMl, error: mlErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: "f2-flujo@example.com" });
check("generar magiclink (admin)", !mlErr && !!linkMl?.properties?.hashed_token, mlErr?.message ?? "");
r = await req(`/auth/confirm?token_hash=${linkMl.properties.hashed_token}&type=magiclink`, {}, false);
guardarCookies(r);
check("/auth/confirm válido → redirect a / con cookies de sesión", [302, 307].includes(r.status) && dondeRedirige(r) === "/" && jar.size > 0, `(${r.status}, ${jar.size} cookies)`);
const setCookies = r.headers.getSetCookie?.() ?? [];
check("cookies de sesión HttpOnly + SameSite=Lax + Secure + Path=/", setCookies.length > 0 && setCookies.every(c => /httponly/i.test(c) && /samesite=lax/i.test(c) && /secure/i.test(c) && /path=\//i.test(c)), setCookies[0]?.replace(/=[^;]{20}[^;]*/, "=***") ?? "sin set-cookie");

// con sesión: páginas y APIs accesibles, páginas de auth redirigen a /
r = await req("/");
check("GET / con sesión → 200", r.status === 200, `(${r.status})`);
r = await req("/login");
check("GET /login con sesión → redirect a /", [302, 307].includes(r.status) && dondeRedirige(r) === "/", `(${r.status})`);
r = await req("/api/auth/me");
const me = r.status === 200 ? await r.json() : null;
check("GET /api/auth/me con sesión → email correcto", me?.user?.email === "f2-flujo@example.com", JSON.stringify(me?.user ?? r.status));
r = await req("/api/db");
check("GET /api/db con sesión (cookies) → 200", r.status === 200, `(${r.status})`);
r = await req("/api/tts?q=hola");
check("GET /api/tts con sesión → autorizado (no 401)", r.status !== 401, `(${r.status})`);

// Bearer también sirve (compat con la suite de Fase 1)
const { data: linkB } = await admin.auth.admin.generateLink({ type: "magiclink", email: "f2-flujo@example.com" });
const { data: vSes } = await pub().auth.verifyOtp({ token_hash: linkB.properties.hashed_token, type: "magiclink" });
r = await fetch(BASE + "/api/db", { headers: { Authorization: `Bearer ${vSes.session.access_token}` } });
check("GET /api/db con Bearer → 200", r.status === 200, `(${r.status})`);

// ── 7. Logout REAL: invalida la sesión en el server, no solo borra cookies ──
const cookiesViejas = cookieHeader(); // copia previa al logout (simula "volver atrás"/cookies robadas)
r = await req("/api/auth/logout", { method: "POST" });
guardarCookies(r);
check("POST /api/auth/logout → 200 y borra cookies", r.status === 200 && jar.size === 0, `(${r.status}, quedan ${jar.size})`);
r = await fetch(BASE + "/api/auth/me", { headers: { Cookie: cookiesViejas } });
check("cookies viejas tras logout → 401 (sesión revocada server-side)", r.status === 401, `(${r.status})`);
r = await fetch(BASE + "/", { redirect: "manual", headers: { Cookie: cookiesViejas } });
check("volver a / con cookies viejas → redirect a /login", [302, 307].includes(r.status) && dondeRedirige(r) === "/login", `(${r.status})`);
r = await fetch(BASE + "/api/db", { redirect: "manual", headers: { Cookie: cookiesViejas } });
check("GET /api/db con cookies viejas → 401", r.status === 401, `(${r.status})`);

// ── 8. /auth/confirm con token trucho → a /login con error, sin sesión ──
r = await req("/auth/confirm?token_hash=truchisimo&type=magiclink", {}, false);
check("/auth/confirm inválido → redirect a /login?error", [302, 307].includes(r.status) && (r.headers.get("location") ?? "").includes("/login"), `(${r.status} → ${r.headers.get("location")})`);
check("/auth/confirm inválido no setea cookies de sesión", (r.headers.getSetCookie?.() ?? []).filter(c => !/max-age=0/i.test(c) && !/=;/.test(c)).length === 0);

// cleanup
const { data: lista2 } = await admin.auth.admin.listUsers();
for (const u of lista2?.users ?? []) if (MAILS.includes(u.email)) await admin.auth.admin.deleteUser(u.id);

console.log(fails === 0 ? "TODO OK" : `FALLARON ${fails}`);
process.exit(fails === 0 ? 0 : 1);
