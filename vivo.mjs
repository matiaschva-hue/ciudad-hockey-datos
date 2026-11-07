// En vivo: mientras juega Ciudad, lee LarrySport cada minuto (solo los torneos con partidos en juego) y escribe
// el marcador en ccba_config/vivo { json: { <partidoId>: { gc, gr, ts } }, corriendo, hasta }. La web y el Studio lo
// escuchan y muestran el marcador al momento (LarrySport no dice en qué cuarto va: eso se carga a mano en el Studio).
// Uso: node vivo.mjs             → sigue los partidos de hoy hasta que terminan (máx. 5 h)
//      node vivo.mjs --arrancar  → si hay un partido de Ciudad en juego o por empezar y nadie lo sigue, dispara el modo vivo
import fs from 'fs';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const CLUB = '00000009';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = new URL('.', import.meta.url);
// SECO=1: una sola vuelta con todos los partidos de hoy, sin escribir (para probar)
const SECO = !!process.env.SECO;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
const refVivo = doc(db, 'ccba_config', 'vivo');
const DIV = { Primera: 'primera', Intermedia: 'intermedia', Segunda: 'segunda', Cuarta: 'cuarta', Quinta: 'quinta', Sexta: 'sexta', Septima: 'septima' };
const DIVC = Object.fromEntries(Object.entries(DIV).map(([k, v]) => [v, k]));
const esCiudad = (n) => /^CIUDAD(?: ([A-H]))?$/i.exec((n || '').trim());
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const limpia = (s) => s.replace(/[\ue000-\uf8ff\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 };
const pad = (n) => String(n).padStart(2, '0');
const hoyAR = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
// ventana de un partido: desde 10 min antes hasta 2 h 30 después de la hora
const inicio = (p) => new Date(`${p.fecha}T${p.hora || '12:00'}:00-03:00`).getTime();
const enJuego = (p, t = Date.now(), antes = 10) => SECO || t >= inicio(p) - antes * 6e4 && t <= inicio(p) + 150 * 6e4;

const paq = JSON.parse((await getDoc(doc(db, 'ccba_cache', 'datos'))).data().json);
const hoy = hoyAR();
const deHoy = Object.entries(paq.partidos || {}).filter(([, p]) => p.fuente === 'larry' && p.fecha === hoy && p.hora).map(([id, p]) => ({ id, ...p }));

if (process.argv.includes('--arrancar')) {
  const v = await getDoc(refVivo), corriendo = v.exists() ? v.data().corriendo || 0 : 0;
  if (Date.now() - corriendo < 6 * 6e4) { console.log('Ya hay alguien siguiendo en vivo.'); process.exit(0); }
  const prox = deHoy.filter((p) => enJuego(p, Date.now(), 40));
  if (!prox.length) { console.log('No hay partidos de Ciudad en juego ni por empezar.'); process.exit(0); }
  console.log('Arranco el modo vivo por:', prox.map((p) => `${p.equipo} ${p.hora} vs ${p.rival}`).join(', '));
  execSync('gh workflow run actualizar.yml -f modo=vivo', { stdio: 'inherit' });
  process.exit(0);
}

const torneos = JSON.parse(fs.readFileSync(new URL('larry_torneos.json', DIR), 'utf8'));
const torneoDe = (p) => torneos.find((t) => t.rama === p.equipo.split('-')[0] && t.cat === DIVC[p.equipo.split('-')[1]] && t.nombre === p.torneo);
const v0 = await getDoc(refVivo);
let vivo = {}; try { vivo = v0.exists() ? JSON.parse(v0.data().json || '{}') : {}; } catch (e) {}
for (const id of Object.keys(vivo)) if (!deHoy.some((p) => p.id === id)) delete vivo[id]; // lo de otros días se va
const hasta = Math.min(Date.now() + 5 * 36e5, Math.max(...deHoy.map((p) => inicio(p) + 150 * 6e4), 0));
console.log(deHoy.length, 'partidos de Ciudad hoy · sigo hasta', new Date(hasta).toLocaleTimeString('es-AR'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=es-AR'] });
const pg = await browser.newPage(); await pg.setViewport({ width: 1280, height: 1000 });
// marcadores de hoy de un torneo (filtrado a Ciudad): [{ id, gc, gr }]
async function leer(t) {
  await pg.goto(t.url + '?clubId=' + CLUB, { waitUntil: 'networkidle2', timeout: 60000 });
  await pg.waitForFunction(() => /Fecha \d+|Llaves|Todas las fechas/.test(document.querySelector('main')?.innerText || ''), { timeout: 30000 }).catch(() => {});
  await espera(1000);
  await pg.evaluate(() => { const e = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && e.innerText?.trim() === 'Todas las fechas'); e?.click(); });
  await espera(2000);
  const L = (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(limpia).filter(Boolean), out = [];
  const anio = new Date().getFullYear(), div = DIV[t.cat];
  for (let i = 0; i < L.length; i++) {
    const m = /^(lun|mar|mié|jue|vie|sáb|dom)\w* (\d{1,2}) (\w{3,4})/.exec(L[i]); if (!m || MES[m[3]] === undefined) continue;
    const fecha = `${anio}-${pad(MES[m[3]] + 1)}-${pad(m[2])}`; if (fecha !== hoy) continue;
    const loc = L[i + 1], a = L[i + 2], b = L[i + 3];
    if (!/^\d+( \(\d+\))?$/.test(a || '') || !/^\d+( \(\d+\))?$/.test(b || '')) continue;
    const vis = L[i + 4], gl = parseInt(a), gv = parseInt(b);
    for (const [esLocal, c] of [[true, esCiudad(loc)], [false, esCiudad(vis)]]) {
      if (!c) continue;
      const tira = /proyecc/i.test(t.nombre) ? 'E' : (c[1] || 'A').toUpperCase(), rival = esLocal ? vis : loc;
      out.push({ id: `lp-${t.rama}-${div}-${tira.toLowerCase()}-${slug(t.nombre)}-${fecha}-${slug(rival)}`, gc: esLocal ? gl : gv, gr: esLocal ? gv : gl });
    }
  }
  return out;
}
let latido = 0;
try {
  while (Date.now() < hasta) {
    const activos = deHoy.filter((p) => enJuego(p));
    const ts = [...new Set(activos.map(torneoDe).filter(Boolean))];
    let cambio = false;
    for (const t of ts) {
      try {
        for (const r of await leer(t)) {
          if (!activos.some((p) => p.id === r.id)) continue;
          const v = vivo[r.id]; if (v && v.gc === r.gc && v.gr === r.gr) continue;
          vivo[r.id] = { gc: r.gc, gr: r.gr, ts: Date.now() }; cambio = true;
          console.log(new Date().toLocaleTimeString('es-AR'), r.id, r.gc + '-' + r.gr);
        }
      } catch (e) { console.log('no pude leer', t.nombre, e.message); }
    }
    if (SECO) { console.log('(seco) leídos', ts.length, 'torneos:', JSON.stringify(vivo)); break; }
    if (cambio || Date.now() - latido > 4 * 6e4) { latido = Date.now(); await setDoc(refVivo, { json: JSON.stringify(vivo), corriendo: Date.now(), hasta }); }
    if (!activos.length && !deHoy.some((p) => inicio(p) > Date.now())) break; // ya terminó todo lo de hoy
    await espera(ts.length ? 45000 : 120000);
  }
} finally {
  if (!SECO) await setDoc(refVivo, { json: JSON.stringify(vivo), corriendo: 0, hasta: Date.now() });
  await browser.close();
}
