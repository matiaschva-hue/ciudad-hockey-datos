// Perfiles de jugadores para la web de Ciudad Hockey.
// Lee ccba_perfiles/datos (lo genera perfiles.mjs en cada actualización) y arma ficha + cumpleaños.
// Sin dependencias: se le pasa la instancia de Firestore que ya usa la web.
//
//   import { cargarPerfiles, cumpleaniosProximos, fichaHTML } from './perfiles.js';
//   const perfiles = await cargarPerfiles(db);
//
// Regla del club: desde los 18, fecha de nacimiento (perfil.nacimiento = 'AAAA-MM-DD');
// menores, solo categoría (perfil.categoria). Nunca hay fecha de menores en los datos.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

const DIV = { primera: 'Primera', intermedia: 'Intermedia', segunda: 'Segunda', cuarta: 'Cuarta', quinta: '5ta', sexta: '6ta', septima: '7ma', octava: '8va', novena: '9na' };
const ORDEN = ['novena', 'octava', 'septima', 'sexta', 'quinta', 'cuarta', 'segunda', 'intermedia', 'primera'];
let cache = null;

export async function cargarPerfiles(db) {
  if (cache) return cache;
  const s = await getDoc(doc(db, 'ccba_perfiles', 'datos'));
  cache = s.exists() ? JSON.parse(s.data().json).perfiles : [];
  return cache;
}

const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const buscar = (perfiles, texto) => { const t = sinAcentos(texto).split(/\s+/).filter(Boolean); return perfiles.filter((p) => t.every((x) => sinAcentos(p.nombre).includes(x))); };

// Edad hoy, y la que cumple en su próximo cumpleaños
export function edad(fecha, hoy = new Date()) {
  const [y, m, d] = fecha.split('-').map(Number);
  const yaCumplio = hoy.getMonth() + 1 > m || (hoy.getMonth() + 1 === m && hoy.getDate() >= d);
  return hoy.getFullYear() - y - (yaCumplio ? 0 : 1);
}
export function proximoCumple(fecha, hoy = new Date()) {
  const [y, m, d] = fecha.split('-').map(Number);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let c = new Date(h.getFullYear(), m - 1, d);
  if (c < h) c = new Date(h.getFullYear() + 1, m - 1, d);
  return { fecha: c, dias: Math.round((c - h) / 86400000), cumple: c.getFullYear() - y };
}

// Equipo, PJ, goles, número y capitanía de una temporada (por defecto la más reciente)
export function temporada(p, anio = Math.max(...p.anios)) {
  const ts = p.temporadas.filter((t) => t.anio === anio).sort((a, b) => ORDEN.indexOf(b.div) - ORDEN.indexOf(a.div));
  return {
    anio,
    equipo: ts.map((t) => `${DIV[t.div] || t.div}${t.tira ? ' ' + t.tira : ''}`).join(' + '),
    pj: ts.reduce((s, t) => s + (t.pj || 0), 0),
    goles: ts.reduce((s, t) => s + (t.goles || 0), 0),
    numero: [...new Set(ts.map((t) => t.numero).filter(Boolean))].join(', '),
    capitan: ts.some((t) => t.capitan),
  };
}

// Cumpleaños de los próximos `dias` días (solo mayores: los menores no tienen fecha)
export function cumpleaniosProximos(perfiles, dias = 7, hoy = new Date()) {
  return perfiles.filter((p) => p.nacimiento)
    .map((p) => ({ perfil: p, ...proximoCumple(p.nacimiento, hoy) }))
    .filter((c) => c.dias < dias)
    .sort((a, b) => a.dias - b.dias || a.perfil.nombre.localeCompare(b.perfil.nombre));
}

// Texto sugerido para el post de cumpleaños
export function textoPost(p, hoy = new Date()) {
  const { cumple } = proximoCumple(p.nacimiento, hoy);
  const t = temporada(p);
  const desde = Math.min(...p.anios);
  const partes = [`¡Feliz cumpleaños ${p.nombre}! 🎂 ${cumple} años.`, `Juega en ${t.equipo}${t.numero ? ` con la ${t.numero}` : ''}${t.capitan ? ' y es capitán/a' : ''}.`];
  if (t.pj) partes.push(`Esta temporada: ${t.pj} partidos${t.goles ? ` y ${t.goles} goles` : ''}.`);
  if (p.anios.length > 1 && p.goles) partes.push(`Lleva ${p.goles} goles con Ciudad desde ${desde}.`);
  return partes.join(' ');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fichaHTML(p, hoy = new Date()) {
  const t = temporada(p);
  const dato = p.nacimiento
    ? `${p.nacimiento.split('-').reverse().join('/')} · ${edad(p.nacimiento, hoy)} años`
    : p.categoria ? `Categoría ${esc(p.categoria)}` : '';
  const filas = [...p.temporadas].sort((a, b) => b.anio - a.anio || ORDEN.indexOf(b.div) - ORDEN.indexOf(a.div)).map((x) =>
    `<tr><td>${x.anio}</td><td>${esc(DIV[x.div] || x.div)}${x.tira ? ' ' + esc(x.tira) : ''}</td><td>${x.pj ?? ''}</td><td>${x.goles}</td></tr>`).join('');
  return `<article class="ficha">
  <h2>${esc(p.nombre)}${t.numero ? ` <span class="num">#${esc(t.numero)}</span>` : ''}</h2>
  <p class="sub">${esc(p.rama === 'damas' ? 'Damas' : 'Caballeros')} · ${esc(t.equipo)}${t.capitan ? ' · Capitán/a' : ''}${dato ? ' · ' + dato : ''}</p>
  <div class="numeros"><div><b>${t.pj}</b><span>PJ ${t.anio}</span></div><div><b>${t.goles}</b><span>Goles ${t.anio}</span></div><div><b>${p.goles}</b><span>Goles desde ${Math.min(...p.anios)}</span></div></div>
  <table><thead><tr><th>Año</th><th>Equipo</th><th>PJ</th><th>Goles</th></tr></thead><tbody>${filas}</tbody></table>
  <p class="nota">Años anteriores a ${t.anio}: solo partidos de quienes hicieron goles (no hay planillas).</p>
</article>`;
}

export function cumpleaniosHTML(perfiles, dias = 7, hoy = new Date()) {
  const lista = cumpleaniosProximos(perfiles, dias, hoy);
  if (!lista.length) return `<p>No hay cumpleaños en los próximos ${dias} días.</p>`;
  return `<ul class="cumples">${lista.map(({ perfil: p, fecha, dias: d, cumple }) =>
    `<li><b>${d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })}</b> · ${esc(p.nombre)} (${cumple}) · ${esc(temporada(p).equipo)}
      <details><summary>Texto para el post</summary><p>${esc(textoPost(p, hoy))}</p></details></li>`).join('')}</ul>`;
}
