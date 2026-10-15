// Importador LarrySport (Tournament Tracker AHBA) → datos de Ciudad Hockey.
// Lee la web pública con un navegador, filtrada por el club CIUDAD (igual que la app de resultados de REAL).
// Uso: node larry.mjs [descubrir|leer|todo]   → escribe larry_torneos.json / larry_data.json
// Temporadas anteriores: TEMPORADA=2024 node larry.mjs todo → larry_torneos_2024.json / larry_data_2024.json
// RAPIDO=1 node larry.mjs leer → solo los torneos con partidos de Ciudad ayer, hoy o mañana (los demás quedan como estaban al subir)
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { leerPdf, parsear, golesCiudad } from './planilla_pdf.mjs';

const BASE = 'https://tournamenttracker.buenosaireshockey.ar/';
const CLUB = '00000009';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CATS = ['Primera', 'Intermedia', 'Segunda', 'Cuarta', 'Quinta', 'Sexta', 'Septima'];
const RAMAS = { Femenino: 'damas', Masculino: 'caballeros' };
const DIR = new URL('.', import.meta.url);
const espera = ms => new Promise(r => setTimeout(r, ms));
const modo = process.argv[2] || 'todo';
const TEMPORADA = process.env.TEMPORADA || '';
const RAPIDO = !!process.env.RAPIDO && !TEMPORADA;
const isoDia = (d) => new Date(Date.now() + d * 864e5 - 3 * 36e5).toISOString().slice(0, 10); // día en hora argentina (d = -1 ayer, 0 hoy, 1 mañana)
const DIAS_PLANILLA = 3; // partidos jugados en los últimos 3 días: se lee su planilla para saber quién hizo los goles
const sufijo = TEMPORADA ? '_' + TEMPORADA : '';

async function hacerClick(pg, fn, arg, que) {
  for (let i = 0; i < 20; i++) { if (await pg.evaluate(fn, arg)) { await espera(1200); return true; } await espera(700); }
  throw new Error('No encontré: ' + que);
}
// click en el elemento "hoja" con ese texto exacto (dentro de main)
const porTexto = t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === t); if (!e) return false; e.click(); return true; };
const empiezaCon = t => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim().startsWith(t + ' (')); if (!e) return false; e.click(); return true; };

// Deja la página en: 2026 > CIUDAD > rama > categoría (lista de torneos)
async function abrirCategoria(pg, rama, cat) {
  if (TEMPORADA) return abrirCategoriaTemporada(pg, rama, cat);
  await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await hacerClick(pg, () => { const b = [...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Clubes'); if (!b) return false; b.click(); return true; }, null, 'Clubes');
  await hacerClick(pg, () => { const d = document.querySelector('main [role=combobox], main .ms-Dropdown'); if (!d) return false; d.click(); return true; }, null, 'combo club');
  await hacerClick(pg, () => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item, button, span')].find(e => e.innerText?.trim() === 'CIUDAD'); if (!o) return false; o.click(); return true; }, null, 'CIUDAD');
  await hacerClick(pg, porTexto, rama, rama);
  // esperar a que aparezca la lista de categorías, si no una página lenta da "sin torneos"
  await pg.waitForFunction(() => [...document.querySelectorAll('main *')].some(e => e.children.length === 0 && /^\S+ \(\d+\)$/.test(e.innerText?.trim() || '')), { timeout: 20000 }).catch(() => {});
  if (process.env.DEBUG) console.log('   categorías de Ciudad en', rama, TEMPORADA || '', '→', (await pg.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && /^\S+ \((\d+|Sin torneos)\)$/.test(e.innerText?.trim() || '')).map(e => e.innerText.trim()))).join(' · '));
  const hay = await pg.evaluate(t => [...document.querySelectorAll('main *')].some(e => e.children.length === 0 && new RegExp('^' + t + ' \\(\\d+\\)$').test(e.innerText?.trim() || '')), cat);
  if (!hay) return false;
  await hacerClick(pg, empiezaCon, cat, cat);
  await pg.waitForFunction(() => /Torneos\s*\n/.test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }).catch(() => {});
  await espera(1500);
  return true;
}

// Temporadas anteriores: el buscador por club no trae nada, así que se entra sin club (Todos):
// año > rama > categoría > todos los torneos. Después cada torneo se lee filtrado por Ciudad (eso sí funciona).
const botonQue = re => { const b = [...document.querySelectorAll('main button')].find(b => new RegExp(re).test(b.innerText.trim())); if (!b) return false; b.click(); return true; };
const radio = t => { const b = [...document.querySelectorAll('main button[role=radio]')].find(b => b.innerText.trim().split('\n')[0].trim().startsWith(t)); if (!b) return false; b.click(); return true; };
async function abrirCategoriaTemporada(pg, rama, cat) {
  await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await hacerClick(pg, botonQue, '^20\\d\\d$', 'botón de temporada');
  await hacerClick(pg, () => { const d = document.querySelector('main [role=combobox]'); if (!d) return false; d.click(); return true; }, null, 'combo temporada');
  await hacerClick(pg, a => { const o = [...document.querySelectorAll('[role=option], .ms-Dropdown-item')].find(e => e.innerText?.trim() === a); if (!o) return false; o.click(); return true; }, TEMPORADA, 'temporada ' + TEMPORADA);
  if (!(await pg.evaluate(a => [...document.querySelectorAll('main button')].some(b => b.innerText.trim() === a), TEMPORADA))) throw new Error('No quedó elegida la temporada ' + TEMPORADA);
  await hacerClick(pg, botonQue, '^(Rama|Femenino|Masculino)$', 'botón rama');
  await hacerClick(pg, radio, rama, rama);
  await hacerClick(pg, botonQue, '^Categor', 'botón categoría');
  await pg.waitForFunction(() => document.querySelectorAll('main button[role=radio]').length > 2, { timeout: 20000 }).catch(() => {});
  const hay = await pg.evaluate(t => [...document.querySelectorAll('main button[role=radio]')].some(b => new RegExp('^' + t + ' \\(\\d+\\)').test(b.innerText.trim())), cat);
  if (!hay) return false;
  await hacerClick(pg, radio, cat, cat);
  await pg.waitForFunction(() => /Torneos\s*\n/.test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }).catch(() => {});
  await espera(1500);
  return true;
}

async function descubrir(pg) {
  const out = [];
  for (const rama of Object.keys(RAMAS)) for (const cat of TEMPORADA ? [...CATS, 'Octava', 'Novena'] : CATS) {
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
  fs.writeFileSync(new URL(`larry_torneos${sufijo}.json`, DIR), JSON.stringify(out, null, 1));
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
  const anio = +TEMPORADA || new Date().getFullYear(), partidos = [];
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
  // goleadores de Ciudad de los partidos recién jugados: el botón "Ver planilla" de cada fila abre el PDF
  if (!TEMPORADA) {
    const desde = isoDia(-DIAS_PLANILLA), MESN = MES;
    const filas = await pg.evaluate(() => {
      const out = [], vistos = new Set();
      document.querySelectorAll('main button[title="Ver planilla"]').forEach((b, i) => {
        if (b.disabled) return; let e = b;
        for (let k = 0; k < 8 && e; k++) { e = e.parentElement; if ((e?.innerText.match(/\n/g) || []).length >= 3) break; }
        const txt = (e?.innerText || '').split('\n').map(x => x.trim()).filter(Boolean).join('|');
        if (!vistos.has(txt)) { vistos.add(txt); out.push({ i, txt }); }
      });
      return out;
    });
    for (const f of filas) {
      const [fe, loc, a, b, vis] = f.txt.split('|'), m = /^\S+ (\d{1,2}) (\w{3,4})/.exec(fe || '');
      if (!m || MESN[m[2]] === undefined || !/^\d+/.test(a || '') || !/^\d+/.test(b || '')) continue;
      const fecha = `${anio}-${pad(MESN[m[2]] + 1)}-${pad(m[1])}`; if (fecha < desde) continue;
      const p = partidos.find(x => x.fecha === fecha && limpia(x.local) === limpia(loc) && limpia(x.visitante) === limpia(vis)); if (!p) continue;
      try {
        const url = await pg.evaluate(async (i) => { let u = ''; const o = window.open; window.open = (x) => { u = x; return null; };
          document.querySelectorAll('main button[title="Ver planilla"]')[i].click(); await new Promise(r => setTimeout(r, 1200)); window.open = o; return u; }, f.i);
        if (!url) continue;
        const g = golesCiudad(parsear(leerPdf(url)));
        if (g.local) p.golesLocal = g.local; if (g.visitante) p.golesVis = g.visitante;
        console.log('   planilla', fecha, loc, a, '-', b, vis, '→', [...(g.local || []), ...(g.visitante || [])].map(j => j.nombre + (j.goles > 1 ? ' x' + j.goles : '')).join(', ') || 'sin goles de Ciudad');
      } catch (e) { console.log('   no pude leer la planilla de', fecha, loc, vis, e.message); }
    }
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
  // temporadas anteriores: goleadores de Ciudad del torneo (la corrida actual los lee aparte, con goleadores.mjs)
  let goleadores;
  if (TEMPORADA && partidos.length) {
    const hayTab = await pg.evaluate(() => { const b = [...document.querySelectorAll('main button, main [role=tab]')].find(b => b.innerText.trim() === 'Goleadores'); if (!b) return false; b.click(); return true; });
    if (hayTab) {
      await pg.waitForFunction(() => /Promedio/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 }).catch(() => {});
      await espera(1500);
      const G = (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(limpia).filter(Boolean);
      goleadores = [];
      for (let i = G.indexOf('Promedio') + 1; i >= 1 && i < G.length - 4; i += 6) {
        if (!/^\d+$/.test(G[i])) break;
        if (/^CIUDAD(?: [A-H])?$/i.test(G[i + 2])) goleadores.push({ apellidoNombre: G[i + 1], club: G[i + 2], goles: +G[i + 3], pj: +G[i + 4] });
      }
    }
  }
  return { ...t, partidos, tabla, ...(goleadores ? { goleadores } : {}) };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=es-AR'] });
const pg = await browser.newPage();
await pg.setViewport({ width: 1280, height: 1000 });
try {
  let torneos = modo === 'leer' ? JSON.parse(fs.readFileSync(new URL(`larry_torneos${sufijo}.json`, DIR), 'utf8')) : await descubrir(pg);
  let saltear = [];
  if (RAPIDO) {
    const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
    const s = await getDoc(doc(db, 'ccba_cache', 'datos')), prev = s.exists() ? JSON.parse(s.data().json) : null;
    const dias = [isoDia(-1), isoDia(0), isoDia(1)], DIVC = { primera: 'Primera', intermedia: 'Intermedia', segunda: 'Segunda', cuarta: 'Cuarta', quinta: 'Quinta', sexta: 'Sexta', septima: 'Septima' };
    const clave = new Set(Object.values(prev?.partidos || {}).filter(p => p.fuente === 'larry' && dias.includes(p.fecha)).map(p => `${p.equipo.split('-')[0]}|${DIVC[p.equipo.split('-')[1]]}|${p.torneo}`));
    const usar = torneos.filter(t => clave.has(`${t.rama}|${t.cat}|${t.nombre}`));
    saltear = torneos.filter(t => !usar.includes(t)); torneos = usar;
    console.log('Modo rápido:', torneos.length, 'torneos con partidos', dias.join(' / '), '·', saltear.length, 'quedan como estaban');
  }
  if (modo !== 'descubrir') {
    const data = [];
    for (const t of torneos) {
      try { const r = await leerTorneo(pg, t); data.push(r); console.log(t.rama, t.cat, t.nombre, '→', r.partidos.length, 'partidos,', r.tabla.length, 'en tabla'); }
      catch (e) { console.log('ERROR', t.nombre, e.message); data.push({ ...t, error: e.message, partidos: [], tabla: [] }); }
    }
    // modo rápido: los torneos no leídos van marcados para que subir.mjs conserve lo que ya estaba
    for (const t of saltear) data.push({ ...t, error: 'no leído (modo rápido)', partidos: [], tabla: [], salteado: true });
    fs.writeFileSync(new URL(`larry_data${sufijo}.json`, DIR), JSON.stringify({ temporada: +TEMPORADA || new Date().getFullYear(), leido: new Date().toISOString(), rapido: RAPIDO, torneos: data }, null, 1));
  }
} finally { await browser.close(); }
