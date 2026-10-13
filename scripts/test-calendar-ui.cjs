// UI real del build de Next con API simulada: no toca datos de usuarios.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const requireRuntime = createRequire(path.join(process.env.CODEX_NODE_MODULES ||
  'C:/Users/janob/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'package.json'));
const { chromium } = requireRuntime('playwright');
const root = process.cwd();
const output = path.join(root, '.next', 'calendar-qa');
fs.mkdirSync(output, { recursive: true });
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const fixture = () => ({
  materias: ['Macroeconomía', 'Matemática', 'Introducción', 'Contabilidad', 'Avanzada', 'Seminario'].map((nombre, i) =>
    ({ id: id(i + 1), nombre, examen: '', metaHoras: 15 })).concat([
      { id: id(7), nombre: 'Macroeconomía', examen: '2026-12-20T09:00', metaHoras: 15 },
    ]),
  planEstudio: { '2026-10-14': [id(1)], '2026-10-15': [id(3)] },
  sesiones: {}, preparacion: {}, semestres: [], notas: [],
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = url.pathname === '/calendario' ? path.join(root, '.next/server/app/calendario.html')
    : url.pathname.startsWith('/_next/') ? path.join(root, '.next', url.pathname.slice(7))
    : path.join(root, 'public', url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const width of [1440, 768, 390]) for (const theme of ['classic', 'glass']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let data = fixture(), fail = false, posts = 0;
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.clock.setFixedTime(new Date('2026-10-13T12:00:00-03:00'));
      await page.addInitScript(({ initial, theme }) => {
        localStorage.setItem('stuniv_db_v1', JSON.stringify({ d: initial, full: false }));
        localStorage.setItem('uca_theme', theme);
      }, { initial: data, theme });
      await page.route('**/api/db*', async route => {
        if (route.request().method() === 'POST') {
          posts++;
          if (fail) { fail = false; return route.fulfill({ status: 500, json: { error: 'simulado' } }); }
          const body = route.request().postDataJSON();
          assert(body.planDia, 'UI debe enviar sólo el día editado');
          const { fecha, materiaIds } = body.planDia;
          if (materiaIds.length) data.planEstudio[fecha] = materiaIds;
          else delete data.planEstudio[fecha];
          // Observa todos los frames después de confirmar el guardado: el
          // selector debe desaparecer una vez y permanecer desmontado.
          await page.evaluate(() => {
            window.__closeFrames = [];
            let end = performance.now() + 600;
            function frame() {
              window.__closeFrames.push(!!document.querySelector('[data-plan-dialog]'));
              if (performance.now() < end) requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          });
          return route.fulfill({ json: { ok: true, data } });
        }
        const snapshot = structuredClone(data);
        return route.fulfill({ json: snapshot });
      });
      await page.route('**/api/account/profile', route => route.fulfill({ json: {
        email: 'prueba@example.com', nombre: 'Prueba', apellido: '', apodo: '', universidad: '', carrera: '', temaColor: 'azul', fotoUrl: null,
      } }));
      await page.route('https://www.googletagmanager.com/**', route => route.abort());
      await page.goto(base + '/calendario', { waitUntil: 'domcontentloaded' });
      const day = page.locator('[data-fecha="2026-10-14"]');
      await day.click();
      await page.getByRole('button', { name: 'Matemática', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ state: 'hidden' });
      await page.waitForTimeout(250);
      assert.equal(await day.locator('[data-materia]').count(), 2, 'guardar debe conservar Matemática');
      await day.click();
      assert.equal(await page.getByRole('button', { name: 'Matemática', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await page.waitForTimeout(200);
      for (let round = 0; round < 3; round++) {
        await day.click();
        for (const name of ['Introducción', 'Contabilidad', 'Avanzada', 'Seminario']) {
          const chip = page.getByRole('button', { name, exact: true });
          await chip.click();
          assert.equal(await chip.getAttribute('aria-pressed'), round % 2 === 0 ? 'true' : 'false', `${theme} ${width} round ${round} ${name}`);
        }
        await page.getByRole('button', { name: 'Guardar', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ state: 'hidden' });
        const expected = round % 2 === 0 ? 6 : 2;
        assert.equal(await day.locator('[data-materia]').count(), expected);
        const heights = await day.locator('[data-materia]').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
        assert(heights.every(h => h > 2), 'ninguna barra puede colapsar');
        assert(Math.max(...heights) - Math.min(...heights) < 1, 'segmentos iguales');
        assert.deepEqual(data.planEstudio['2026-10-15'], [id(3)], 'guardar no modifica otro día');
        await page.waitForTimeout(200);
      }
      await page.screenshot({ path: path.join(output, `calendar-${width}-${theme}.png`) });
      await day.click();
      await page.getByRole('button', { name: 'Matemática', exact: true }).click();
      fail = true;
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'No se pudo guardar' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Matemática', exact: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await day.locator('[data-materia]').count(), 5);
      // Recarga usando el estado persistido por la API simulada, sin cache inicial.
      await page.addInitScript(() => localStorage.removeItem('stuniv_db_v1'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-fecha="2026-10-14"] [data-materia]').first().waitFor();
      assert.equal(await page.locator('[data-fecha="2026-10-14"] [data-materia]').count(), 5);
      await page.locator('[data-fecha="2026-10-14"]').click();
      assert.equal(await page.getByRole('button', { name: 'Macroeconomía', exact: true }).count(), 1);
      for (const name of ['Macroeconomía', 'Introducción', 'Contabilidad', 'Avanzada', 'Seminario']) {
        const chip = page.getByRole('button', { name, exact: true });
        assert.equal(await chip.getAttribute('aria-pressed'), 'true', `${theme} ${name} antes de quitar`);
        await chip.click();
        assert.equal(await chip.getAttribute('aria-pressed'), 'false', `${theme} ${name} después de quitar`);
      }
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-fecha="2026-10-14"] [data-materia]').count(), 0);
      assert.deepEqual(data.planEstudio['2026-10-15'], [id(3)]);
      await page.waitForTimeout(650);
      const closeFrames = await page.evaluate(() => window.__closeFrames);
      const firstClosed = closeFrames.indexOf(false);
      assert(firstClosed >= 0 && closeFrames.slice(firstClosed).every(v => !v), 'el selector no puede reaparecer después de cerrar');
      // Un día vacío no puede preseleccionar Macro, ni al guardar sólo Matemática.
      await page.locator('[data-fecha="2026-10-16"]').click();
      const macro = page.getByRole('button', { name: 'Macroeconomía', exact: true });
      assert.equal(await macro.getAttribute('aria-pressed'), 'false');
      assert.equal(await macro.evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.getByRole('button', { name: 'Matemática', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.locator('[data-fecha="2026-10-16"]').click();
      assert.equal(await macro.getAttribute('aria-pressed'), 'false');
      await macro.click();
      assert.equal(await macro.getAttribute('aria-pressed'), 'true');
      assert.equal(await macro.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(107, 159, 212)');
      await macro.click();
      assert.equal(await macro.getAttribute('aria-pressed'), 'false');
      assert.equal(await macro.evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.deepEqual(data.planEstudio['2026-10-16'], [id(2)]);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`PASS: ${width}px ${theme}, guardar/reabrir/repetir/error/recargar/vaciar/múltiples exámenes (${posts} POST)`);
      await page.close();
    }
    const stalePage = await browser.newPage();
    await stalePage.clock.setFixedTime(new Date('2026-10-13T12:00:00-03:00'));
    await stalePage.addInitScript(initial => localStorage.setItem('stuniv_db_v1', JSON.stringify({ d: initial })), fixture());
    let releaseFresh;
    await stalePage.route('**/api/db*', async route => {
      await new Promise(r => { releaseFresh = r; });
      const fresh = fixture(); fresh.planEstudio['2026-10-14'] = [];
      return route.fulfill({ json: fresh });
    });
    await stalePage.route('**/api/account/profile', route => route.fulfill({ json: null }));
    await stalePage.goto(base + '/calendario', { waitUntil: 'domcontentloaded' });
    assert(await stalePage.locator('[data-fecha="2026-10-14"]').isDisabled(), 'no editar selecciones de un cache viejo');
    releaseFresh();
    await stalePage.locator('[data-fecha="2026-10-14"]').click();
    assert.equal(await stalePage.getByRole('button', { name: 'Macroeconomía', exact: true }).getAttribute('aria-pressed'), 'false');
    console.log('PASS: el cache viejo no preselecciona Macro en el editor');
    await stalePage.close();
    // Cambia la fila del examen relevante mientras el editor está abierto.
    // El borrador debe seguir seleccionado y poder desmarcarse de una vez.
    const changingPage = await browser.newPage();
    await changingPage.clock.setFixedTime(new Date('2026-10-13T12:00:00-03:00'));
    const changingData = fixture();
    await changingPage.addInitScript(initial => localStorage.setItem('stuniv_db_v1', JSON.stringify({ d: initial })), changingData);
    await changingPage.route('**/api/db*', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.materias) changingData.materias = body.materias;
        else {
          const { fecha, materiaIds } = body.planDia;
          changingData.planEstudio[fecha] = materiaIds;
        }
        return route.fulfill({ json: { data: changingData } });
      }
      return route.fulfill({ json: changingData });
    });
    await changingPage.route('**/api/account/profile', route => route.fulfill({ json: null }));
    await changingPage.goto(base + '/calendario', { waitUntil: 'domcontentloaded' });
    await changingPage.locator('[data-fecha="2026-10-14"]').click();
    const changingMacro = changingPage.getByRole('button', { name: 'Macroeconomía', exact: true });
    assert.equal(await changingMacro.getAttribute('aria-pressed'), 'true');
    await changingPage.getByRole('button', { name: /Agregar examen/ }).click();
    await changingPage.locator('select').selectOption(id(7));
    await changingPage.getByRole('button', { name: 'Agregar', exact: true }).click();
    await changingPage.locator('select').waitFor({ state: 'detached' });
    assert.equal(await changingMacro.getAttribute('aria-pressed'), 'true', 'revalidar no debe cambiar el borrador');
    await changingMacro.click();
    assert.equal(await changingMacro.getAttribute('aria-pressed'), 'false');
    await changingPage.getByRole('button', { name: 'Guardar', exact: true }).click();
    await changingPage.getByRole('dialog').waitFor({ state: 'detached' });
    assert.deepEqual(changingData.planEstudio['2026-10-14'], []);
    console.log('PASS: Macro se desmarca incluso si cambia el examen mientras se edita');
    await changingPage.close();
    const loadingPage = await browser.newPage();
    await loadingPage.clock.setFixedTime(new Date('2026-10-13T12:00:00-03:00'));
    let failLoad = true;
    await loadingPage.route('**/api/db*', route => route.fulfill(failLoad
      ? { status: 500, json: { error: 'simulado' } } : { json: fixture() }));
    await loadingPage.route('**/api/account/profile', route => route.fulfill({ json: null }));
    await loadingPage.goto(base + '/calendario', { waitUntil: 'domcontentloaded' });
    await loadingPage.getByRole('alert').filter({ hasText: 'No se pudieron cargar' }).waitFor();
    assert(await loadingPage.locator('[data-fecha="2026-10-14"]').isDisabled());
    failLoad = false;
    await loadingPage.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await loadingPage.locator('[data-fecha="2026-10-14"] [data-materia]').waitFor();
    assert(await loadingPage.locator('[data-fecha="2026-10-14"]').isEnabled());
    console.log('PASS: primera carga fallida bloquea edición y permite reintentar');
    await loadingPage.close();
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
