// Carreras deterministas sobre el módulo real, sin cuentas ni red externa.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DATA_DEFAULT } = loadTypes();
function loadTypes() {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/types.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, { exports: mod.exports, module: mod });
  return mod.exports;
}
const fresh = () => structuredClone(DATA_DEFAULT);
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const response = data => ({ status: 200, ok: true, json: async () => data });
const tick = () => new Promise(r => setImmediate(r));
function api(fetch, source = fs.readFileSync(process.env.CALENDAR_API_SOURCE || 'app/lib/api.ts', 'utf8')) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports: mod.exports, module: mod, require: () => ({ DATA_DEFAULT }), fetch, Date, Set, Map, console });
  return mod.exports;
}
(async () => {
  const old = fresh(), saved = fresh();
  saved.planEstudio['2026-10-14'] = ['matematica'];
  const late = deferred();
  const a = api(async (_, opts) => opts?.method === 'POST' ? response({ data: saved }) : late.promise);
  const read = a.fetchData();
  await tick();
  await a.savePlanEstudio(saved.planEstudio);
  late.resolve(response(old));
  await read;
  assert.equal(a.getCached().planEstudio['2026-10-14'][0], 'matematica');
  console.log('PASS: GET atrasado no pisa un guardado');

  const olderRead = deferred(), newerRead = deferred(); let reads = 0;
  const order = api(async () => ++reads === 1 ? olderRead.promise : newerRead.promise);
  const read1 = order.fetchData(true); await tick();
  const read2 = order.fetchData(true); await tick();
  newerRead.resolve(response(saved)); await read2;
  olderRead.resolve(response(old)); await read1;
  assert.equal(order.getCached().planEstudio['2026-10-14'][0], 'matematica');
  console.log('PASS: lecturas forzadas fuera de orden');

  const first = deferred(); let calls = 0;
  const b = api(async () => ++calls === 1 ? first.promise : response({ data: saved }));
  const w1 = b.saveNotas(['nota']), w2 = b.savePlanDia('2026-10-14', ['matematica']);
  await tick(); assert.equal(calls, 1);
  first.resolve(response({ data: old }));
  await Promise.all([w1, w2]); assert.equal(calls, 2);
  assert.equal(b.getCached().planEstudio['2026-10-14'][0], 'matematica');
  console.log('PASS: escrituras serializadas');

  let fail = true;
  const c = api(async () => fail ? { status: 500, ok: false } : response({ data: saved }));
  await assert.rejects(c.savePlanDia('2026-10-14', []));
  fail = false; await c.savePlanDia('2026-10-14', ['matematica']);
  assert.equal(c.getCached().planEstudio['2026-10-14'][0], 'matematica');
  console.log('PASS: un error permite reintentar');

  const stale = deferred();
  const d = api(() => stale.promise);
  const loading = d.fetchData(); await tick();
  d.limpiarCache(); stale.resolve(response(saved));
  await assert.rejects(loading); assert.equal(d.hayCache(), false);
  console.log('PASS: respuesta de sesión anterior descartada');

  const full = fresh(); full.semestres = [{ id: 'historial' }];
  const e = api(async (_, opts) => opts?.method === 'POST'
    ? response({ data: { ...saved, semestres: undefined } }) : response(full));
  await e.fetchData(false, { full: true }); await e.savePlanDia('2026-10-14', ['matematica']);
  assert.equal(e.getCached().semestres[0].id, 'historial');
  console.log('PASS: conservar historial al guardar');

  const materias = [{ id: 'viejo', nombre: ' Matemática ', examen: '2020-01-01T09:00' },
    { id: 'nuevo', nombre: 'matemática', examen: '2099-01-01T09:00' }];
  assert.equal(a.planDelDia(['viejo', 'nuevo', 'borrado'], materias, a.materiasEfectivas(materias)).join(), 'nuevo');
  console.log('PASS: misma materia con varios exámenes y referencias huérfanas');
})().catch(e => { console.error(e); process.exitCode = 1; });
