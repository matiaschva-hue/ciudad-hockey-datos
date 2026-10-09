// Temporadas anteriores de LarrySport (2022 en adelante: resultados, tablas y goleadores; no hay planillas).
// Uso: node historico.mjs explorar   → muestra cómo es la página (selector de año) para ajustar el importador
import puppeteer from 'puppeteer-core';

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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=es-AR'] });
const pg = await browser.newPage();
await pg.setViewport({ width: 1280, height: 1000 });
try {
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
