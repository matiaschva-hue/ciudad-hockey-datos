// Importador LarrySport (Tournament Tracker AHBA) → datos de Ciudad Hockey.
// Lee la web pública con un navegador, filtrada por el club CIUDAD (igual que la app de resultados de REAL).
// Uso: node larry.mjs [descubrir|leer|todo]   → escribe larry_torneos.json / larry_data.json
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const BASE = 'https://tournamenttracker.buenosaireshockey.ar/';
const CLUB = '00000009';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CATS = ['Primera', 'Intermedia', 'Segunda', 'Cuarta', 'Quinta', 'Sexta', 'Septima'];
const RAMAS = { Femenino: 'damas', Masculino: 'caballeros' };
const DIR = new URL('.', import.meta.url);
const espera = ms => new Promise(r => setTimeout(r, ms));
const modo = process.argv[2] || 'todo';

async function hacerClick(pg, fn, arg, que) {
  for (let i = 0; i < 20; i++) { if (await pg.evaluate(fn, arg)) { await espera(1200); return true; } await espera(700); }
  throw new Error('No encontré: ' + que);
}
// click en el elemento "hoja" con ese texto exacto (dentro de main)
const porTexto = t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === t); if (!e) return false; e.click(); return true; };
const empiezaCon = t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim().startsWith(t + ' (')); if (!e) return false; e.click(); return true; };

// Deja la página en: 2026 > CIUDAD > rama > categoría (lista de torneos)
async function abrirCategoria(pg, rama, cat) {
  await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await hacerClick(pg, () => { const b = [...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Clubes'); if (!b) return false; b.click(); return true; }, null, 'Clubes');
  await hacerClick(pg, () => { const d = document.querySelector('main [role=combobox], main .ms-Dropdown'); if (!d) return false; d.click(); return true; }, null, 'combo club');
  await hacerClick(pg, () => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item, button, span')].find(e => e.innerText?.trim() === 'CIUDAD'); if (!o) return false; o.click(); return true; }, null, 'CIUDAD');
  await hacerClick(pg, porTexto, rama, rama);
  // esperar a que aparezca la lista de categorías, si no una página lenta da "sin torneos"
  await pg.waitForFunction(() => [...document.querySelectorAll('main *')].some(e => e.children.length === 0 && /^\S+ \(\d+\)$/.test(e.innerText?.trim() || '')), { timeout: 20000 }).catch(() => {});
  const hay = await pg.evaluate(t => [...document.querySelectorAll('main *')].some(e => e.children.length === 0 && new RegExp('^' + t + ' \\(\\d+\\)$').test(e.innerText?.trim() || '')), cat);
  if (!hay) return false;
  await hacerClick(pg, empiezaCon, cat, cat);
  await pg.waitForFunction(() => /Torneos\s*\n/.test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }).catch(() => {});
  await espera(1500);
  return true;
}

async function descubrir(pg) {
  const out = [];
  for (const rama of Object.keys(RAMAS)) for (const cat of CATS) {
    if (!(await abrirCategoria(pg, rama, cat))) { console.log(rama, cat, '— sin torneos'); continue; }
    const txt = await pg.evaluate(() => document.querySelector('main').innerText);
    const L = txt.slice(txt.indexOf('Torneos') + 7).split('\n').map(s => s.trim()).filter(Boolean);
    // la lista trae íconos (caracteres de uso privado) como renglones aparte, y títulos de grupo
    const nombres = L.map(s => s.replace(/[-]/g, '').trim()).filter(s => s && !/^Campeonato\b|^Proyecci[oó]n - |^- Torneos|^Torneos/.test(s));
    console.log(rama, cat, nombres.join(' | '));
    for (const [k, n] of nombres.entries()) {
      if (k > 0) await abrirCategoria(pg, rama, cat);
      await hacerClick(pg, porTexto, n, n);
      await pg.waitForFunction(b => location.href !== b, { timeout: 15000 }, BASE).catch(() => {});
      out.push({ rama: RAMAS[rama], cat, nombre: n, url: pg.url().split('?')[0] });
      console.log('   ', n, '→', pg.url());
    }
  }
  fs.writeFileSync(new URL('larry_torneos.json', DIR), JSON.stringify(out, null, 1));
  return out;
}

const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 };
const pad = n => String(n).padStart(2, '0');
const limpia = s => s.replace(/[\ue000-\uf8ff\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();

async function leerTorneo(pg, t) {
  await pg.goto(t.url + '?clubId=' + CLUB, { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => /Fecha \d+|Llaves|Todas las fechas/.test(document.querySelector('main')?.innerText || ''), { timeout: 30000 }).catch(() => {});
  await espera(1500);
  // "Todas las fechas" muestra el fixture completo (filtrado al club)
  await pg.evaluate(() => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === 'Todas las fechas'); e?.click(); });
  await espera(2500);
  const L = (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(limpia).filter(Boolean);
  const anio = new Date().getFullYear(), partidos = [];
  let fechaN = '', ronda = '';
  for (let i = 0; i < L.length; i++) {
    if (/^Fecha \d+$/.test(L[i])) { fechaN = L[i]; continue; }
    if (/^(Dieciseisavos|Octavos|Cuartos|Semi|Final|Tercer|3er|Zona|Grupo)\b/i.test(L[i]) && !/\d{2}:\d{2}/.test(L[i])) { ronda = L[i]; continue; }
    const m = /^(lun|mar|mié|jue|vie|sáb|dom)\w* (\d{1,2}) (\w{3,4})(?: (\d{2}:\d{2}))?/.exec(L[i]); if (!m || MES[m[3]] === undefined) continue;
    const loc = L[i + 1], a = L[i + 2], b = L[i + 3];
    let vis, gl = null, gv = null;
    if (a === 'Vs') vis = L[i + 3];
    else if (/^\d+( \(\d+\))?$/.test(a) && /^\d+( \(\d+\))?$/.test(b)) { gl = parseInt(a); gv = parseInt(b); vis = L[i + 4]; }
    else continue;
    if (!loc || !vis) continue;
    partidos.push({ fecha: `${anio}-${pad(MES[m[3]] + 1)}-${pad(m[2])}`, hora: m[4] || '', local: loc, visitante: vis, gl, gv, fechaN: ronda && !fechaN ? ronda : fechaN });
  }
  // posiciones
  let tabla = [];
  const tieneTab = await pg.evaluate(() => { const b = [...document.querySelectorAll('main button, main [role=tab]')].find(b => b.innerText.trim() === 'Posiciones'); if (!b) return false; b.click(); return true; });
  if (tieneTab) {
    await espera(2500);
    const P = (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(limpia).filter(Boolean);
    const h = P.indexOf('PB');
    if (h > 0) for (let i = h + 1; i < P.length - 10; i += 11) {
      if (!/^\d+$/.test(P[i])) break;
      // # · equipo · Pts · PJ · PG · PE · PP · GF · GC · DG · PB
      tabla.push({ equipo: P[i + 1], pts: +P[i + 2], pj: +P[i + 3], pg: +P[i + 4], pe: +P[i + 5], pp: +P[i + 6], gf: +P[i + 7], gc: +P[i + 8] });
    }
    if (process.env.DEBUG) console.log(P.slice(Math.max(0, h - 12), h + 24));
  }
  return { ...t, partidos, tabla };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=es-AR'] });
const pg = await browser.newPage();
await pg.setViewport({ width: 1280, height: 1000 });
try {
  let torneos = modo === 'leer' ? JSON.parse(fs.readFileSync(new URL('larry_torneos.json', DIR), 'utf8')) : await descubrir(pg);
  if (modo !== 'descubrir') {
    const data = [];
    for (const t of torneos) {
      try { const r = await leerTorneo(pg, t); data.push(r); console.log(t.rama, t.cat, t.nombre, '→', r.partidos.length, 'partidos,', r.tabla.length, 'en tabla'); }
      catch (e) { console.log('ERROR', t.nombre, e.message); data.push({ ...t, error: e.message, partidos: [], tabla: [] }); }
    }
    fs.writeFileSync(new URL('larry_data.json', DIR), JSON.stringify({ leido: new Date().toISOString(), torneos: data }, null, 1));
  }
} finally { await browser.close(); }
