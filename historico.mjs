// Temporadas anteriores de LarrySport (2022 en adelante: resultados, tablas y goleadores; no hay planillas).
// Uso: TEMPORADA=2025 node larry.mjs todo   (lee la temporada → larry_data_2025.json)
//      node historico.mjs subir 2025 [--seco]   → un documento por temporada: ccba_historico/2025
//      node historico.mjs explorar|pasos|todos   → muestra cómo es la página (para ajustar el importador)
import fs from 'fs';

const BASE = 'https://tournamenttracker.buenosaireshockey.ar/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = ms => new Promise(r => setTimeout(r, ms));
const modo = process.argv[2] || 'explorar';

// Todo lo que se puede clickear o elegir en la página, con su texto
const controles = () => [...document.querySelectorAll('button, [role=combobox], [role=tab], [role=option], select, a, .ms-Dropdown, [aria-haspopup]')]
  .map(e => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : ''} «${(e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 60)}»`)
  .filter((s, i, a) => a.indexOf(s) === i);
const conAnios = () => [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && /\b20(1\d|2\d)\b/.test(e.innerText || ''))
  .map(e => `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').split(' ')[0]} «${e.innerText.trim().slice(0, 60)}» padre=${e.parentElement?.tagName.toLowerCase()}[${e.parentElement?.getAttribute('role') || ''}]`).slice(0, 40);

async function volcar(pg, titulo) {
  console.log(`\n===== ${titulo} · ${pg.url()}`);
  console.log('--- texto de main:\n' + ((await pg.evaluate(() => (document.querySelector('main') || document.body).innerText)) || '').slice(0, 2500));
  console.log('--- controles:\n' + (await pg.evaluate(controles)).slice(0, 80).join('\n'));
  console.log('--- elementos con años:\n' + (await pg.evaluate(conAnios)).join('\n'));
}

if (modo === 'subir') await subir();
else {
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=es-AR'] });
const pg = await browser.newPage();
await pg.setViewport({ width: 1280, height: 1000 });
try {
  if (modo === 'pasos') {
    // recorre año → Clubes → CIUDAD → rama mostrando la página después de cada paso
    const anio = process.env.TEMPORADA || '2025';
    const click = async (que, fn, arg) => { const r = await pg.evaluate(fn, arg); console.log(`\n>>> click ${que}:`, r); await espera(2500); };
    await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 }); await espera(2000);
    await click('botón año', () => { const b = [...document.querySelectorAll('main button')].find(b => /^20\d\d$/.test(b.innerText.trim())); b?.click(); return b?.innerText; });
    await click('combo temporada', () => { const d = document.querySelector('main [role=combobox]'); d?.click(); return d?.innerText; });
    console.log('opciones:', await pg.evaluate(() => [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].map(e => e.innerText.trim()).join(' | ')));
    await click('opción ' + anio, a => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].find(e => e.innerText?.trim() === a); o?.click(); return !!o; }, anio);
    await volcar(pg, 'año elegido');
    await click('Clubes', () => { const b = [...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Clubes'); b?.click(); return !!b; });
    await click('combo club', () => { const d = document.querySelector('main [role=combobox]'); d?.click(); return d?.innerText; });
    console.log('opciones con CIU:', await pg.evaluate(() => [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].map(e => e.innerText.trim()).filter(t => /CIU/i.test(t)).join(' | ')));
    await click('CIUDAD', () => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].find(e => e.innerText?.trim() === 'CIUDAD'); o?.click(); return !!o; });
    await volcar(pg, 'CIUDAD elegido');
    await click('Rama', () => { const b = [...document.querySelectorAll('main button')].find(b => /^(Rama|Femenino|Masculino)$/.test(b.innerText.trim())); b?.click(); return b?.innerText; });
    await volcar(pg, 'panel rama');
    await click('Masculino', () => { const e = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && e.innerText?.trim() === 'Masculino'); const o = e.at(-1); o?.click(); return e.length; });
    await volcar(pg, 'Masculino elegido');
  }
  if (modo === 'todos') {
    // sin club: año → rama → categoría → torneos → adentro de un torneo
    const anio = process.env.TEMPORADA || '2025';
    const radio = t => { const b = [...document.querySelectorAll('main button[role=radio]')].find(b => b.innerText.trim().split('\n')[0].trim().startsWith(t)); b?.click(); return b?.innerText.replace(/\s+/g, ' '); };
    const boton = re => { const b = [...document.querySelectorAll('main button')].find(b => new RegExp(re).test(b.innerText.trim())); b?.click(); return b?.innerText; };
    const click = async (que, fn, arg) => { const r = await pg.evaluate(fn, arg); console.log(`\n>>> ${que}:`, r); await espera(2500); };
    await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 }); await espera(2000);
    await click('botón año', boton, '^20\\d\\d$');
    await click('combo', () => { const d = document.querySelector('main [role=combobox]'); d?.click(); return d?.innerText; });
    await click('opción ' + anio, a => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].find(e => e.innerText?.trim() === a); o?.click(); return !!o; }, anio);
    await click('botón rama', boton, '^(Rama|Femenino|Masculino)$');
    await click('Masculino', radio, 'Masculino');
    await click('botón categoría', boton, '^Categor');
    await volcar(pg, 'categorías');
    await click('Primera', radio, 'Primera');
    await pg.waitForFunction(() => /Torneos\s*\n/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 }).catch(() => {});
    await volcar(pg, 'torneos de Primera');
    const txt = await pg.evaluate(() => document.querySelector('main').innerText);
    const L = txt.slice(txt.indexOf('Torneos') + 7).split('\n').map(s => s.replace(/[\ue000-\uf8ff]/g, '').trim()).filter(Boolean).filter(s => !/^Campeonato\b|^Proyecci[oó]n - |^- Torneos|^Torneos|^Podes buscar/.test(s));
    console.log('torneos:', L.join(' | '));
    const T = process.env.TORNEO || 'Caballeros A';
    await click('torneo ' + T, t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === t); e?.click(); return !!e; }, T);
    await pg.waitForFunction(b => location.href !== b, { timeout: 15000 }, BASE).catch(() => {});
    await espera(3000);
    const url = pg.url().split('?')[0];
    await volcar(pg, 'adentro de ' + T);
    console.log('botones del fixture:', await pg.evaluate(() => [...document.querySelectorAll('main button, main [role=combobox], main [role=tab], main [role=option]')].map(b => (b.innerText || b.title || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).join(' | ')));
    await click('Todas las fechas', () => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === 'Todas las fechas'); e?.click(); return !!e; });
    const todo = await pg.evaluate(() => document.querySelector('main').innerText);
    console.log('--- con todas las fechas (' + todo.length + ' caracteres, CIUDAD aparece ' + (todo.match(/CIUDAD/g) || []).length + ' veces):\n' + todo.slice(0, 1800));
    await click('pestaña Principal', () => { const b = [...document.querySelectorAll('main button, main [role=tab]')].find(b => b.innerText.trim() === 'Principal'); b?.click(); return !!b; });
    console.log('--- Principal:\n' + (await pg.evaluate(() => document.querySelector('main').innerText)).slice(0, 2000));
    // ¿el filtro de club anda adentro del torneo?
    await pg.goto(url + '?clubId=00000009', { waitUntil: 'networkidle2', timeout: 60000 }); await espera(3000);
    await click('Todas las fechas (con club)', () => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === 'Todas las fechas'); e?.click(); return !!e; });
    const conClub = await pg.evaluate(() => document.querySelector('main').innerText);
    console.log('--- con ?clubId=00000009 (' + conClub.length + ' caracteres, CIUDAD ' + (conClub.match(/CIUDAD/g) || []).length + ' veces):\n' + conClub.slice(0, 1500));
  }
  if (modo === 'explorar') {
    await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await espera(3000);
    await volcar(pg, 'inicio');
    // abrir lo que parezca un selector de año y mostrar las opciones
    const abierto = await pg.evaluate(() => {
      const e = [...document.querySelectorAll('button, [role=combobox], .ms-Dropdown, [aria-haspopup], select')].find(e => /\b20\d\d\b/.test(e.innerText || e.value || ''));
      if (!e) return null; e.click(); return (e.innerText || e.value).trim();
    });
    console.log('\nselector de año clickeado:', abierto);
    if (abierto) { await espera(2000); await volcar(pg, 'selector abierto'); }
    // la ruta que usa larry.mjs: Clubes
    await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await espera(2000);
    await pg.evaluate(() => [...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Clubes')?.click());
    await espera(2500);
    await volcar(pg, 'Clubes');
  }
} finally { await browser.close(); }
}

// Arma y sube ccba_historico/<año>: { temporada, equipos, partidos, tablas, torneos } (mismo formato de partidos que ccba_cache/datos).
// En Caballeros, A y B comparten torneo y sin planillas no se sabe de qué tira es cada goleador:
// los goleadores quedan por torneo (torneos[].goleadores) y en el equipo solo si el torneo tiene una sola tira de Ciudad.
async function subir() {
  const anio = process.argv[3], SECO = process.argv.includes('--seco');
  const data = JSON.parse(fs.readFileSync(new URL(`larry_data_${anio}.json`, import.meta.url), 'utf8'));
  const DIV = { Primera: 'primera', Intermedia: 'intermedia', Segunda: 'segunda', Cuarta: 'cuarta', Quinta: 'quinta', Sexta: 'sexta', Septima: 'septima', Octava: 'octava', Novena: 'novena' };
  const esCiudad = n => /^CIUDAD(?: ([A-H]))?$/i.exec((n || '').trim());
  const slug = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const equipos = {}, partidos = {}, tablas = {}, torneos = [];
  for (const t of data.torneos) {
    const div = DIV[t.cat]; if (!div || t.error) continue;
    const copa = /copa/i.test(t.nombre), eqs = new Set();
    for (const p of t.partidos) {
      const cl = esCiudad(p.local), cv = esCiudad(p.visitante);
      for (const [esLocal, c] of [[true, cl], [false, cv]]) {
        if (!c) continue;
        const tira = /proyecc/i.test(t.nombre) ? 'E' : (c[1] || 'A').toUpperCase();
        const eq = `${t.rama}-${div}-${tira.toLowerCase()}`;
        const rival = esLocal ? p.visitante : p.local;
        if (esCiudad(rival) && tira === 'E') continue;
        eqs.add(eq);
        partidos[`h${anio}-${eq}-${slug(t.nombre)}-${p.fecha}-${slug(rival)}`] = { equipo: eq, fecha: p.fecha, hora: p.hora, rival, local: esLocal, fechaN: p.fechaN || '',
          gc: esLocal ? p.gl : p.gv, gr: esLocal ? p.gv : p.gl, torneo: t.nombre, copa, temporada: +anio, fuente: 'larry' };
        equipos[eq] ||= { rama: t.rama, div, tira, torneos: [] };
        if (!equipos[eq].torneos.includes(t.nombre)) equipos[eq].torneos.push(t.nombre);
      }
    }
    if (!eqs.size) continue; // torneo sin Ciudad
    const tabla = t.tabla.map(f => ({ equipo: f.equipo, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, gf: f.gf, gc: f.gc, pts: f.pts }));
    const goleadores = (t.goleadores || []).map(g => { const [ap, no] = g.apellidoNombre.split(',').map(x => x.trim()); return { nombre: no ? `${no} ${ap}` : ap, apellidoNombre: g.apellidoNombre, goles: g.goles, pj: g.pj }; }).sort((a, b) => b.goles - a.goles || a.pj - b.pj);
    torneos.push({ rama: t.rama, div, nombre: t.nombre, copa, equipos: [...eqs], tabla, goleadores });
    for (const eq of eqs) {
      if (tabla.length && !copa) tablas[`${eq}|${t.nombre}`] = { equipo: eq, torneo: t.nombre, filas: tabla };
      if (eqs.size === 1 && goleadores.length) (equipos[eq].goleadores ||= []).push(...goleadores.map(g => ({ ...g, torneo: t.nombre })));
    }
  }
  const doc_ = { v: 1, temporada: +anio, actualizado: new Date().toISOString(), equipos, partidos, tablas, torneos };
  const json = JSON.stringify(doc_);
  console.log(`Temporada ${anio}: ${Object.keys(equipos).length} equipos, ${Object.keys(partidos).length} partidos, ${torneos.length} torneos con Ciudad, ${torneos.reduce((s, t) => s + t.goleadores.length, 0)} goleadores · ${Math.round(json.length / 1024)} KB`);
  for (const [eq, e] of Object.entries(equipos).sort()) {
    const ps = Object.values(partidos).filter(p => p.equipo === eq && p.gc != null);
    console.log('  ', eq.padEnd(24), e.torneos.join(' + ').padEnd(50), ps.length, 'PJ', ps.filter(p => p.gc > p.gr).length, 'PG', ps.filter(p => p.gc === p.gr).length, 'PE', ps.filter(p => p.gc < p.gr).length, 'PP');
  }
  if (json.length > 1000000) throw new Error('El documento supera el máximo de Firestore (1 MB)');
  if (SECO) return;
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, doc, setDoc } = await import('firebase/firestore');
  const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
  await setDoc(doc(db, 'ccba_historico', String(anio)), { json, actualizado: doc_.actualizado });
  console.log('Subido ccba_historico/' + anio);
  process.exit(0);
}
