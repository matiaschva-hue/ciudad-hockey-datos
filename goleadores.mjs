// Goleadores oficiales de Ciudad: pestaña "Goleadores" de cada torneo en LarrySport (filtrada por club).
// Escribe goleadores.json: { "damas-primera-a": [{ nombre: "Brisa Bruggesser", apellidoNombre: "Bruggesser, Brisa", goles: 7, pj: 16, rank: 20 }] }
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const DIR = new URL('.', import.meta.url);
const CLUB = '00000009';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIV = { Primera: 'primera', Intermedia: 'intermedia', Segunda: 'segunda', Cuarta: 'cuarta', Quinta: 'quinta', Sexta: 'sexta', Septima: 'septima' };
const espera = ms => new Promise(r => setTimeout(r, ms));
const torneos = JSON.parse(fs.readFileSync(new URL('larry_torneos.json', DIR), 'utf8')).filter(t => !/copa/i.test(t.nombre));

const TIRA_TORNEO = { "Damas A": "A", "Damas C1": "B", "Damas C2": "C", "Damas E2": "D", "Proyeccion Zona 1": "E", "Segunda A": "A", "Segunda B": "B" };
const PL = fs.existsSync(new URL("planteles.json", DIR)) ? JSON.parse(fs.readFileSync(new URL("planteles.json", DIR), "utf8")) : {};
const nn = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
function tiraPorPlantel(apellidoNombre, rama, div) {
  const k = nn(apellidoNombre.replace(",", " "));
  let mejor = null;
  for (const t of ["a", "b"]) { const j = (PL[`${rama}-${div}-${t}`]?.jugadores || []).find((x) => nn(x.nombre) === k); if (j && (!mejor || j.pj > mejor.pj)) mejor = { t, pj: j.pj }; }
  return mejor ? mejor.t.toUpperCase() : null;
}
const out = {};
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const pg = await browser.newPage();
await pg.setViewport({ width: 1280, height: 1000 });
try {
  for (const t of torneos) {
    await pg.goto(t.url + '?clubId=' + CLUB, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.waitForFunction(() => [...document.querySelectorAll('main button, main [role=tab]')].some(b => b.innerText.trim() === 'Goleadores'), { timeout: 30000 }).catch(() => {});
    await pg.evaluate(() => [...document.querySelectorAll('main button, main [role=tab]')].find(b => b.innerText.trim() === 'Goleadores')?.click());
    await pg.waitForFunction(() => /Promedio/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 }).catch(() => {});
    await espera(1500);
    const L = (await pg.evaluate(() => document.querySelector('main').innerText)).split('\n').map(s => s.trim()).filter(Boolean);
    let n = 0;
    for (let i = L.indexOf('Promedio') + 1; i >= 1 && i < L.length - 5; i += 6) {
      if (!/^\d+$/.test(L[i])) break;
      const [rank, an, club, g, pj] = [L[i], L[i + 1], L[i + 2], L[i + 3], L[i + 4]];
      const m = /^CIUDAD(?: ([A-H]))?$/i.exec(club); if (!m) continue;
      // la pestaña dice "CIUDAD" para todas las tiras: la tira sale del torneo (damas) o del plantel (caballeros A y B comparten torneo)
      let tira = TIRA_TORNEO[t.nombre] || (m[1] || "A").toUpperCase();
      if (t.rama === "caballeros") tira = tiraPorPlantel(an, t.rama, DIV[t.cat]) || tira;
      const eq = `${t.rama}-${DIV[t.cat]}-${tira.toLowerCase()}`;
      const [ap, no] = an.split(',').map(s => s.trim());
      (out[eq] ||= []).push({ nombre: no ? `${no} ${ap}` : ap, apellidoNombre: an, goles: +g, pj: +pj, rank: +rank });
      n++;
    }
    console.log(t.rama, t.cat, t.nombre, '→', n, 'goleadores de Ciudad');
  }
} finally { await browser.close(); }
for (const k of Object.keys(out)) out[k].sort((a, b) => b.goles - a.goles || a.pj - b.pj);
fs.writeFileSync(new URL('goleadores.json', DIR), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'equipos con goleadores');
