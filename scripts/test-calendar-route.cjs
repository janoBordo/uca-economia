const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { z } = require('zod');
const mod = { exports: {} };
const calls = [];
const snapshot = { materias: [], planEstudio: {}, semestres: [] };
const query = new Proxy({}, { get: (_, method) => (...args) => {
  calls.push([method, ...args]);
  return method === 'then' ? Promise.resolve({ error: null }).then(...args) : query;
} });
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: 'usuario' } }, error: null }) },
  from: table => { calls.push(['from', table]); return query; },
  rpc: async () => ({ data: snapshot, error: null }),
};
const json = (data, status = 200) => ({ data, status });
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/db/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, { module: mod, exports: mod.exports, URL, Set, Map, console, require: name => {
  if (name === 'next/server') return { NextResponse: { json: d => json(d) } };
  if (name === 'zod') return { z };
  if (name.includes('ratelimit-local')) return { checkLimit: async () => ({ ok: true }), clientIp: () => 'ip' };
  if (name.includes('/http')) return { generico: (d, s) => json(d, s), noAuth: () => json({}, 401), fallo: e => { throw e; } };
  if (name.includes('/supabase/server')) return { supabaseForRequest: () => sb };
  if (name.includes('/supabase/verificar')) return { usuarioVerificado: async () => ({ id: 'usuario' }) };
  throw Error(name);
} });
const post = body => mod.exports.POST({ json: async () => body });
(async () => {
  const mid = '00000000-0000-4000-8000-000000000001';
  assert.equal((await post({ planDia: { fecha: '2026-10-14', materiaIds: [mid, mid] } })).status, 200);
  assert.equal(calls.filter(c => c[0] === 'upsert').length, 1);
  assert.equal(calls.find(c => c[0] === 'upsert')[1].materia_ids.length, 1);
  assert.equal(calls.find(c => c[0] === 'upsert')[2].onConflict, 'user_id,fecha');
  assert(!calls.some(c => c[0] === 'delete'));
  console.log('PASS: guardar un día usa upsert, sin borrar el calendario');
  calls.length = 0;
  assert.equal((await post({ planDia: { fecha: '2026-10-14', materiaIds: [] } })).status, 200);
  assert(calls.some(c => c[0] === 'eq' && c[1] === 'fecha' && c[2] === '2026-10-14'));
  assert(!calls.some(c => c[0] === 'gte'));
  console.log('PASS: vaciar sólo elimina el día elegido');
  for (const body of [
    { planDia: { fecha: 'mal', materiaIds: [mid] } },
    { planDia: { fecha: '2026-10-14', materiaIds: ['mal'] } },
    { planDia: { fecha: '2026-10-14', materiaIds: Array(33).fill(mid) } },
    { planDia: { fecha: '2026-10-14', materiaIds: [], user_id: 'otro' } },
  ]) assert.equal((await post(body)).status, 400);
  console.log('PASS: rechaza fechas/IDs/formato/límites inválidos');
  sb.auth.getUser = async () => ({ data: { user: null }, error: null });
  calls.length = 0;
  assert.equal((await post({ planDia: { fecha: '2026-10-14', materiaIds: [mid] } })).status, 401);
  assert.equal(calls.length, 0);
  console.log('PASS: exige sesión antes de escribir');
})().catch(e => { console.error(e); process.exitCode = 1; });
