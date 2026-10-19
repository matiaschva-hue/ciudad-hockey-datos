// Lectura de una planilla PDF de LarrySport (compartida por planillas.mjs y larry.mjs).
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const PDFTOTEXT = process.env.PDFTOTEXT || (fs.existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe') ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe' : 'pdftotext');
export const CACHE = new URL('pdf/', import.meta.url); fs.mkdirSync(CACHE, { recursive: true });
export const esCiudad = n => /^CIUDAD(?: ([A-H]))?$/i.exec((n || '').trim());

export function leerPdf(url) {
  const f = fileURLToPath(new URL(url.split('/').pop(), CACHE));
  if (!fs.existsSync(f)) execFileSync('curl', ['-s', '-f', '-L', '--retry', '3', '-o', f, url]);
  // algunas planillas vienen con los acentos codificados dos veces ("SofÃ­a"): se reparan
  return execFileSync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }).replace(/[\u00c2-\u00c3][\u0080-\u00bf]/g, (m) => Buffer.from(m, 'latin1').toString('utf8'));
}
// Devuelve { fecha, local, visitante, lados: { local: {jug, staff}, visitante: {...} } }
export function parsear(txt) {
  const L = txt.split(/\r?\n/);
  const fecha = (/(\d{4}-\d{2}-\d{2})/.exec(txt) || [])[1] || '';
  const iEq = L.findIndex(l => /Equipo local/.test(l));
  const eqLine = L.slice(iEq + 1).find(l => l.trim());
  const [local, visitante] = eqLine.trim().split(/\s{2,}\d*\s*/).filter(Boolean).map(s => s.trim());
  const iHead = L.findIndex(l => /Local\s+Carnet/.test(l));
  const cut = L[iHead].search(/N\S?\s+Visitante/);
  const lados = { local: { jug: [], staff: [] }, visitante: { jug: [], staff: [] } };
  // En algunas planillas pdftotext separa los renglones: el carnet y los goles quedan en otra línea que el nombre.
  // El orden sí se mantiene (el carnet N es del jugador N), así que se juntan nombres y carnets por separado y se emparejan.
  const nombres = { local: [], visitante: [] }, stats = { local: [], visitante: [] };
  for (const l of L.slice(iHead + 1)) {
    if (/^\s*Arbitros|Juez de mesa|Observaciones/.test(l)) break;
    for (const [lado, s] of [['local', l.slice(0, cut)], ['visitante', l.slice(cut)]]) {
      // cuerpo técnico ("T  Apellido, Nombre"): va primero porque su renglón también puede traer carnet y no es un jugador
      const t = /^\s*([TAPM])\s+([^,\d]+,\s*[\p{L}' .-]+?)(?=\s{2,}|\s+\d|\s*$)/u.exec(s);
      if (t) { lados[lado].staff.push({ rol: t[1], nombre: t[2].trim() }); continue; }
      const m = /^\s*(\d{1,3})\s+(\(C\)\s+)?([\p{L}' .-]+?)(?=\s{2,}|\s+\d{5,}|\s*$)/u.exec(s);
      if (m) nombres[lado].push({ numero: m[1], nombre: m[3].trim(), capitan: !!m[2] });
      const c = /(\d{5,})\s+(\d+|-)(?=\s|$)/.exec(s); // carnet y goles (las tarjetas a veces vienen pegadas: "- ---")
      if (c) stats[lado].push({ registro: c[1], goles: c[2] !== '-' ? +c[2] : 0 });
    }
  }
  for (const lado of ['local', 'visitante']) {
    const N = nombres[lado], E = stats[lado];
    if (N.length !== E.length) console.log('   ⚠ planilla', fecha, lado, N.length, 'jugadores y', E.length, 'carnets: no se pueden emparejar todos');
    lados[lado].jug = N.map((j, i) => ({ ...j, registro: E[i]?.registro || '', goles: E[i]?.goles || 0 }));
  }
  return { fecha, local, visitante, lados };
}
// Goleadores de Ciudad en un partido: { local: [{nombre, numero, goles}], visitante: [...] } (solo los lados de Ciudad)
export function golesCiudad(p) {
  const out = {};
  for (const lado of ['local', 'visitante']) if (esCiudad(p[lado])) out[lado] = p.lados[lado].jug.filter(j => j.goles > 0).map(({ nombre, numero, goles }) => ({ nombre, numero, goles }));
  return out;
}
