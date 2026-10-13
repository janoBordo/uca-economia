// Verifica que el dominio público sirva el build revisado, sin usar cuentas.
const assert = require('node:assert/strict');
const base = (process.argv[2] || 'https://stuniv.vercel.app').replace(/\/$/, '');
(async () => {
  const login = await fetch(base + '/login');
  assert.equal(login.status, 200);
  const html = await login.text();
  // Vercel/Linux puede generar hashes diferentes del build local/Windows.
  // Descubrimos los archivos que el propio dominio anuncia.
  const files = Array.from(new Set(Array.from(html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g), m => m[1])));
  const sources = await Promise.all(files.filter(f => f.startsWith('/_next/')).map(async file => {
    const r = await fetch(new URL(file, base));
    assert.equal(r.status, 200, file);
    return { file, source: await r.text() };
  }));
  assert(sources.some(s => s.source.includes('--subject-bg') && s.source.includes('.calendar-subject-chip')), 'CSS del selector actualizado');
  assert(sources.some(s => s.source.includes('planDia')), 'cliente con guardado por día actualizado');
  console.log('PASS: CSS del selector y cliente de datos actualizados en el dominio público');
  assert.equal((await fetch(base + '/api/db')).status, 401);
  assert.equal((await fetch(base + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  console.log('PASS: login disponible; datos y escrituras siguen requiriendo sesión');
})().catch(e => { console.error(e); process.exitCode = 1; });
