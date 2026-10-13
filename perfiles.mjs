// Perfil de cada jugador/a de Ciudad juntando la temporada actual (planillas: PJ, goles, número, capitán) con las
// anteriores (goleadores oficiales 2022–2025). Una fila por persona y rama, con su recorrido año a año.
// Uso: node perfiles.mjs [--seco]   → lee ccba_cache/datos y ccba_historico/<año>, escribe ccba_perfiles/datos
import fs from 'fs';
import { nn, mismoNombre } from './comun.mjs';

const ORDEN = ['novena', 'octava', 'septima', 'sexta', 'quinta', 'cuarta', 'segunda', 'intermedia', 'primera'];
const nombreLindo = (an) => { const [ap, no] = an.split(',').map((x) => x.trim()); return no ? `${no} ${ap}` : ap; };

// Edad que cumple en el año (año - nacimiento) para cada división. Sin confirmar todavía: null = no se estima.
// Formato: { septima: [12, 13], ... } → nacimiento entre anio-13 y anio-12.
export const EDADES = null;

export function armarPerfiles(actual, historicos, anioActual) {
  const P = new Map(); // clave rama|nombre normalizado
  const buscar = (rama, nombre, apellidoNombre) => {
    const k = rama + '|' + nn((apellidoNombre || nombre).replace(',', ' '));
    if (P.has(k)) return P.get(k);
    // nombres cortados en la planilla ("Carranza Centeno Maria Josefi..."): se unen con el nombre completo
    for (const [k2, p] of P) if (k2.startsWith(rama + '|') && (mismoNombre(p.nombre, apellidoNombre || nombre) || mismoNombre(nombre, p.apellidoNombre || p.nombre))) return p;
    const p = { rama, nombre, apellidoNombre: apellidoNombre || '', temporadas: [] };
    P.set(k, p);
    return p;
  };

  // temporada actual: planteles (uno por equipo donde figura)
  for (const j of Object.values(actual.jugadores || {})) {
    const [rama, div, tira] = j.equipo.split('-');
    const p = buscar(rama, j.nombre);
    if (/\.\.\.\s*$/.test(p.nombre) && !/\.\.\.\s*$/.test(j.nombre)) p.nombre = j.nombre;
    p.temporadas.push({ anio: anioActual, div, tira: tira.toUpperCase(), pj: j.pj, goles: j.goles || 0, numero: j.numero, capitan: !!j.capitan, ...(j.refuerzo ? { refuerzo: j.refuerzo } : {}), fuente: 'planilla' });
  }
  // temporadas anteriores: goleadores por torneo (no hay planillas). Una fila por división y año.
  for (const h of historicos) {
    const filas = new Map();
    for (const t of h.torneos) for (const g of t.goleadores || []) {
      const tira = t.equipos.length === 1 ? t.equipos[0].split('-')[2].toUpperCase() : null; // Caballeros A y B en el mismo torneo: no se sabe
      const k = t.rama + '|' + t.div + '|' + nn(g.apellidoNombre.replace(',', ' '));
      const f = filas.get(k) || { rama: t.rama, an: g.apellidoNombre, fila: { anio: h.temporada, div: t.div, tira, pj: 0, goles: 0, torneos: [], fuente: 'goleadores' } };
      f.fila.pj += g.pj; f.fila.goles += g.goles; f.fila.torneos.push(t.nombre);
      if (f.fila.tira !== tira) f.fila.tira = f.fila.tira && tira ? null : f.fila.tira || tira;
      filas.set(k, f);
    }
    for (const { rama, an, fila } of filas.values()) {
      const p = buscar(rama, nombreLindo(an), an);
      if (!p.apellidoNombre) p.apellidoNombre = an;
      p.temporadas.push(fila);
    }
  }

  const out = [];
  for (const p of P.values()) {
    p.temporadas.sort((a, b) => b.anio - a.anio || ORDEN.indexOf(b.div) - ORDEN.indexOf(a.div));
    const anios = [...new Set(p.temporadas.map((t) => t.anio))];
    const res = {
      nombre: p.apellidoNombre ? nombreLindo(p.apellidoNombre) : p.nombre,
      rama: p.rama,
      temporadas: p.temporadas,
      divisiones: [...new Set(p.temporadas.map((t) => t.div))].sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b)),
      anios,
      goles: p.temporadas.reduce((s, t) => s + t.goles, 0),
      golesPorAnio: Object.fromEntries(anios.map((a) => [a, p.temporadas.filter((t) => t.anio === a).reduce((s, t) => s + t.goles, 0)])),
    };
    const nac = estimarNacimiento(p.temporadas);
    if (nac) res.nacimiento = nac;
    out.push(res);
  }
  return out.sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre));
}

// Con la tabla de edades se acota el año de nacimiento. Se puede jugar para arriba pero no para abajo:
//  - cualquier aparición en una división de menores → nació en (año - edad máxima) o después;
//  - en una temporada con planillas (plantel completo), la división más baja de Quinta/Sexta → nació en (año - edad mínima) o antes.
//    Séptima no cuenta para esto: puede ser alguien de Octava (que no se sigue) jugando para arriba.
export function estimarNacimiento(temporadas, edades = EDADES) {
  if (!edades) return null;
  let desde = -Infinity, hasta = Infinity;
  for (const t of temporadas) if (edades[t.div]) desde = Math.max(desde, t.anio - edades[t.div][1]);
  for (const anio of new Set(temporadas.filter((t) => t.fuente === 'planilla').map((t) => t.anio))) {
    const divs = temporadas.filter((t) => t.anio === anio && edades[t.div]).map((t) => t.div).sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b));
    if (divs[0] && divs[0] !== 'septima') hasta = Math.min(hasta, anio - edades[divs[0]][0]);
  }
  if (!isFinite(desde)) return null;
  if (!isFinite(hasta) || hasta < desde) return { desde };
  return desde === hasta ? { anio: desde } : { desde, hasta };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const SECO = process.argv.includes('--seco');
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');
  const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
  const leer = async (c, d) => { const s = await getDoc(doc(db, c, d)); return s.exists() ? JSON.parse(s.data().json) : null; };
  const actual = await leer('ccba_cache', 'datos');
  const anioActual = new Date(actual.actualizado).getFullYear();
  const historicos = [];
  for (let y = anioActual - 1; y >= 2022; y--) { const h = await leer('ccba_historico', String(y)); if (h) historicos.push(h); }
  const perfiles = armarPerfiles(actual, historicos, anioActual);
  const json = JSON.stringify({ v: 1, actualizado: new Date().toISOString(), perfiles });
  console.log(perfiles.length, 'perfiles ·', perfiles.filter((p) => p.anios.length > 1).length, 'con más de una temporada ·', Math.round(json.length / 1024), 'KB');
  if (json.length > 1000000) throw new Error('El documento supera el máximo de Firestore (1 MB)');
  if (!SECO) { await setDoc(doc(db, 'ccba_perfiles', 'datos'), { json, actualizado: new Date().toISOString() }); console.log('Subido ccba_perfiles/datos'); }
  process.exit(0);
}
