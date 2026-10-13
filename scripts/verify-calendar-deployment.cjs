// Verifica que el dominio público sirva el build revisado, sin usar cuentas.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = (process.argv[2] || 'https://stuniv.vercel.app').replace(/\/$/, '');
const manifest = JSON.parse(fs.readFileSync('.next/app-build-manifest.json', 'utf8'));
(async () => {
  const chunk = manifest.pages['/calendario/page'].find(p => p.includes('/app/calendario/page-'));
  const css = manifest.pages['/layout'].find(p => p.endsWith('.css'));
  for (const [file, markers] of [[chunk, ['data-plan-dialog', 'calendar-subject-chip']], [css, ['--subject-bg', '.calendar-subject-chip']]]) {
    const r = await fetch(`${base}/_next/${file}`);
    assert.equal(r.status, 200, file);
    const source = await r.text();
    for (const marker of markers) assert(source.includes(marker), marker);
    console.log(`PASS: build actualizado online (${file})`);
  }
  assert.equal((await fetch(base + '/login')).status, 200);
  assert.equal((await fetch(base + '/api/db')).status, 401);
  assert.equal((await fetch(base + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  console.log('PASS: login disponible; datos y escrituras siguen requiriendo sesión');
})().catch(e => { console.error(e); process.exitCode = 1; });
