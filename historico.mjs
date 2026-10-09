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
