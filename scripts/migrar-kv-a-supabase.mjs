// Migra el export del Vercel KV (blob AppData) a las tablas por-usuario de
// Supabase, bajo la cuenta indicada. Idempotente con --force (pisa lo que esa
// cuenta ya tenga). SOLO toca las filas del usuario destino.
//
// Uso:
//   node scripts/migrar-kv-a-supabase.mjs .env.local <email> [backup.json] [--force]
//
// Requisitos: la cuenta ya tiene que existir (registrada y confirmada en
// /registro). Los ids viejos (slugs) se remapean a uuid, incluyendo las
// referencias en sesiones, preparación y plan de estudio.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import crypto from "node:crypto";

const [envFile, email, backupArg, forceArg] = process.argv.slice(2);
const backupFile = backupArg && !backupArg.startsWith("--") ? backupArg : "backups/uca_data-backup-2026-07-12.json";
const force = [backupArg, forceArg].includes("--force");
if (!envFile || !email) {
  console.error("Uso: node scripts/migrar-kv-a-supabase.mjs .env.local <email> [backup.json] [--force]");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter(l => l.includes("=")).map(l => l.trim().split(/=(.*)/s).slice(0, 2))
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
const die = (msg) => { console.error("ERROR:", msg); process.exit(1); };

// ── 1. Usuario destino ──
let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const { data: res, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) die(error.message);
  user = res.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (res.users.length < 200) break;
}
if (!user) die(`No existe un usuario ${email} — registrate primero en /registro y confirmá el email.`);
if (!user.email_confirmed_at) die(`La cuenta ${email} todavía no confirmó el email.`);
console.log(`Usuario destino: ${user.email} (${user.id})`);

// ── 2. Chequeo de datos previos (no pisar sin --force) ──
const { count } = await admin.from("materias").select("id", { count: "exact", head: true }).eq("user_id", user.id);
if ((count ?? 0) > 0 && !force) die(`La cuenta ya tiene ${count} materias — corré con --force para reemplazar TODO lo suyo.`);
if (force) {
  for (const tabla of ["plan_estudio", "notas", "semestres", "materias"]) { // materias cascadea sesiones
    const { error } = await admin.from(tabla).delete().eq("user_id", user.id);
    if (error) die(`limpiando ${tabla}: ${error.message}`);
  }
  console.log("Datos previos de la cuenta eliminados (--force).");
}

// ── 3. Materias (slug → uuid) + preparación ──
const idMap = new Map((data.materias ?? []).map(m => [m.id, crypto.randomUUID()]));
if (idMap.size) {
  const filas = (data.materias ?? []).map((m, i) => ({
    id: idMap.get(m.id),
    user_id: user.id,
    nombre: m.nombre,
    examen: m.examen || null,
    meta_horas: m.metaHoras ?? 0,
    preparacion: Math.min(100, Math.max(0, Math.round(data.preparacion?.[m.id] ?? 0))),
    posicion: i,
  }));
  const { error } = await admin.from("materias").insert(filas);
  if (error) die(`materias: ${error.message}`);
  console.log(`materias: ${filas.length}`);
}

// ── 4. Sesiones (minutos por materia) ──
const sesiones = Object.entries(data.sesiones ?? {})
  .filter(([slug, min]) => idMap.has(slug) && min > 0)
  .map(([slug, minutos]) => ({ materia_id: idMap.get(slug), user_id: user.id, minutos }));
if (sesiones.length) {
  const { error } = await admin.from("sesiones_estudio").insert(sesiones);
  if (error) die(`sesiones: ${error.message}`);
}
console.log(`sesiones: ${sesiones.length}`);

// ── 5. Semestres archivados (snapshots inmutables, se preservan tal cual) ──
const semestres = (data.semestres ?? []).map((s, i) => ({
  user_id: user.id,
  numero: s.numero ?? i + 1,
  nombre: s.nombre ?? `Semestre ${i + 1}`,
  materias: s.materias ?? [],
  sesiones: s.sesiones ?? {},
  archived_at: s.archivedAt ?? new Date().toISOString(),
}));
if (semestres.length) {
  const { error } = await admin.from("semestres").insert(semestres);
  if (error) die(`semestres: ${error.message}`);
}
console.log(`semestres archivados: ${semestres.length}`);

// ── 6. Plan de estudio ──
const plan = Object.entries(data.planEstudio ?? {})
  .map(([fecha, ids]) => ({
    user_id: user.id,
    fecha,
    materia_ids: (ids ?? []).map(id => idMap.get(id)).filter(Boolean),
  }))
  .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) && p.materia_ids.length > 0);
if (plan.length) {
  const { error } = await admin.from("plan_estudio").insert(plan);
  if (error) die(`plan_estudio: ${error.message}`);
}
console.log(`plan de estudio: ${plan.length} días`);

// ── 7. Notas ──
const notas = (data.notas ?? [])
  .filter(t => typeof t === "string" && t.length > 0)
  .map((texto, posicion) => ({ user_id: user.id, texto: texto.slice(0, 144), posicion }));
if (notas.length) {
  const { error } = await admin.from("notas").insert(notas);
  if (error) die(`notas: ${error.message}`);
}
console.log(`notas: ${notas.length}`);

console.log("\n✔ Migración completa. Verificá entrando a la app con esa cuenta.");
