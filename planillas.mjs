// Planteles de Ciudad a partir de las planillas PDF de LarrySport (botón "Ver planilla" de cada partido).
// 1) Con el navegador junta los links de las planillas de cada torneo (filtrado por club).
// 2) Baja los PDF, los pasa a texto (pdftotext) y saca el lado de Ciudad: número, nombre, capitán/a, goles, DT.
// Guarda planteles.json. No guarda números de carnet.
// Uso: node planillas.mjs [links|leer|todo]
import fs from 'fs';
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';

const DIR = new URL('.', import.meta.url);
const CLUB = '00000009';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PDFTOTEXT = process.env.PDFTOTEXT || (fs.existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe') ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe' : 'pdftotext');
const CACHE = new URL('pdf/', DIR); fs.mkdirSync(CACHE, { recursive: true });
const modo = process.argv[2] || 'todo';
const espera = ms => new Promise(r => setTimeout(r, ms));

async function links() {
  const torneos = JSON.parse(fs.readFileSync(new URL('larry_torneos.json', DIR), 'utf8')).filter(t => !/copa/i.test(t.nombre));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1280, height: 1000 });
  const out = [];
  try {
    for (const t of torneos) {
      await pg.goto(t.url + '?clubId=' + CLUB, { waitUntil: 'networkidle2', timeout: 60000 });
      await pg.waitForFunction(() => /Todas las fechas/.test(document.querySelector('main')?.innerText || ''), { timeout: 30000 }).catch(() => {});
      await pg.evaluate(() => { const e = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText?.trim() === 'Todas las fechas'); e?.click(); });
      await espera(2500);
      // la planilla se abre con window.open: se intercepta para quedarse con la URL
      const urls = await pg.evaluate(async () => {
        const got = []; window.open = u => { got.push(u); return null; };
        for (const b of document.querySelectorAll('main button[title="Ver planilla"]:not([disabled])')) { b.click(); await new Promise(r => setTimeout(r, 900)); }
        return [...new Set(got)];
      });
      out.push({ ...t, planillas: urls });
      console.log(t.rama, t.cat, t.nombre, '→', urls.length, 'planillas');
    }
  } finally { await browser.close(); }
  fs.writeFileSync(new URL('planillas_links.json', DIR), JSON.stringify(out, null, 1));
  return out;
}

const esCiudad = n => /^CIUDAD(?: ([A-H]))?$/i.exec((n || '').trim());
function leerPdf(url) {
  const f = fileURLToPath(new URL(url.split('/').pop(), CACHE));
  if (!fs.existsSync(f)) execFileSync('curl', ['-s', '-f', '-L', '--retry', '3', '-o', f, url]);
  return execFileSync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8' });
}
// Devuelve { fecha, local, visitante, lados: { local: {jug, staff}, visitante: {...} } }
function parsear(txt) {
  const L = txt.split(/\r?\n/);
  const fecha = (/(\d{4}-\d{2}-\d{2})/.exec(txt) || [])[1] || '';
  const iEq = L.findIndex(l => /Equipo local/.test(l));
  const eqLine = L.slice(iEq + 1).find(l => l.trim());
  const [local, visitante] = eqLine.trim().split(/\s{2,}\d*\s*/).filter(Boolean).map(s => s.trim());
  const iHead = L.findIndex(l => /Local\s+Carnet/.test(l));
  const cut = L[iHead].search(/N\S?\s+Visitante/);
  const lados = { local: { jug: [], staff: [] }, visitante: { jug: [], staff: [] } };
  for (const l of L.slice(iHead + 1)) {
    if (/^\s*Arbitros|Juez de mesa|Observaciones/.test(l)) break;
    for (const [lado, s] of [['local', l.slice(0, cut)], ['visitante', l.slice(cut)]]) {
      let m = /^\s*(\d{1,3})\s+(\(C\)\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+?)(?:\s{2,}|\s+\d{5,}|\s*$)(?:\d{5,}\s+([\d-])\s)?/.exec(s);
      if (m) { lados[lado].jug.push({ numero: m[1], nombre: m[3].trim(), capitan: !!m[2], goles: m[4] && m[4] !== '-' ? +m[4] : 0 }); continue; }
      m = /^\s*([TAPM])\s+([^,]+,\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+?)\s*$/.exec(s.trimStart().replace(/\s{2,}.*$/, ''));
      if (m) lados[lado].staff.push({ rol: m[1], nombre: m[2].trim() });
    }
  }
  return { fecha, local, visitante, lados };
}

function leer() {
  const data = JSON.parse(fs.readFileSync(new URL('planillas_links.json', DIR), 'utf8'));
  const DIV = { Primera: 'primera', Intermedia: 'intermedia', Segunda: 'segunda', Cuarta: 'cuarta', Quinta: 'quinta', Sexta: 'sexta', Septima: 'septima' };
  const equipos = {};
  for (const t of data) for (const u of t.planillas) {
    let p; try { p = parsear(leerPdf(u)); } catch (e) { console.log('  no pude leer', u, e.message); continue; }
    for (const lado of ['local', 'visitante']) {
      const c = esCiudad(p[lado]); if (!c) continue;
      const tira = /proyecc/i.test(t.nombre) ? 'E' : (c[1] || 'A').toUpperCase();
      const id = `${t.rama}-${DIV[t.cat]}-${tira.toLowerCase()}`;
      const E = equipos[id] ||= { jugadores: {}, staff: {}, planillas: 0 };
      E.planillas++;
      for (const j of p.lados[lado].jug) {
        const k = j.nombre.toLowerCase();
        const o = E.jugadores[k] ||= { nombre: j.nombre, numero: j.numero, pj: 0, goles: 0, capitan: false, ultima: '' };
        o.pj++; o.goles += j.goles; if (p.fecha >= o.ultima) { o.numero = j.numero; o.ultima = p.fecha; } if (j.capitan) o.capitan = true;
      }
      for (const s of p.lados[lado].staff) { const k = s.rol + s.nombre; const o = E.staff[k] ||= { ...s, n: 0, ultima: '' }; o.n++; if (p.fecha > o.ultima) o.ultima = p.fecha; }
    }
  }
  const out = {};
  for (const [id, E] of Object.entries(equipos)) {
    // plantel actual: jugó 2+ partidos en la tira, o figura en el último mes (los que suben un partido de otra división quedan afuera)
    const ult = Object.values(E.jugadores).reduce((m, j) => (j.ultima > m ? j.ultima : m), '');
    const lim = new Date(ult + 'T12:00:00'); lim.setDate(lim.getDate() - 30);
    const limTxt = lim.toISOString().slice(0, 10);
    const jug = Object.values(E.jugadores).filter(j => j.pj >= 2 || j.ultima >= limTxt);
    out[id] = { planillas: E.planillas, jugadores: jug.sort((a, b) => +a.numero - +b.numero), staff: Object.values(E.staff).sort((a, b) => b.n - a.n) };
    console.log(id, E.planillas, 'planillas →', out[id].jugadores.length, 'jugadores ·', out[id].staff.map(s => s.rol + ' ' + s.nombre).slice(0, 3).join(' / '));
  }
  fs.writeFileSync(new URL('planteles.json', DIR), JSON.stringify(out, null, 1));
}

if (modo === 'links' || modo === 'todo') await links();
if (modo === 'leer' || modo === 'todo') leer();
if (modo === 'test') console.log(JSON.stringify(parsear(execFileSync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', process.argv[3], '-'], { encoding: 'utf8' })), null, 1));
