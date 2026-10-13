// Control de datos después de cada actualización: lee lo publicado en Firestore y avisa si algo no cierra.
// Los avisos salen como anotaciones en GitHub Actions (::warning::) y en el resumen de la corrida.
// No corta la corrida: los datos ya están subidos; sirve para enterarse a tiempo.
// Uso: node auditar.mjs
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
const leer = async (c, d) => { const s = await getDoc(doc(db, c, d)); return s.exists() ? JSON.parse(s.data().json) : null; };
const d = await leer('ccba_cache', 'datos');
const avisos = [], ok = [];
const aviso = (m) => { avisos.push(m); console.log('::warning::' + m); };

const hoy = new Date(), dia = (n) => new Date(hoy.getTime() - n * 86400000).toISOString().slice(0, 10);
const Ps = Object.values(d.partidos);

// 1. el paquete es de esta corrida
const horas = (hoy - new Date(d.actualizado)) / 3600000;
if (horas > 2) aviso(`El paquete publicado tiene ${Math.round(horas)} h: esta corrida no lo actualizó.`); else ok.push('paquete actualizado');

// 2. partidos jugados hace más de 2 días sin resultado
const sinRes = Ps.filter((p) => p.fecha < dia(2) && p.gc == null);
if (sinRes.length) aviso(`${sinRes.length} partidos de hace más de 2 días sin resultado (ej.: ${sinRes.slice(0, 3).map((p) => `${p.fecha} ${p.equipo} vs ${p.rival}`).join('; ')}).`);
else ok.push('todos los partidos jugados tienen resultado');

// 3. tabla de posiciones vs partidos de Ciudad
const tablas = [];
for (const [eq, t] of Object.entries(d.tablas || {})) {
  const ps = Ps.filter((p) => p.equipo === eq && !p.copa && p.torneo === t.torneo && p.gc != null);
  const tira = eq.split('-')[2];
  const fila = t.filas.find((f) => (tira === 'a' || tira === 'e') ? /^CIUDAD$/i.test(f.equipo.trim()) : f.equipo.trim().toUpperCase() === 'CIUDAD ' + tira.toUpperCase());
  if (!fila) { tablas.push(`${eq}: Ciudad no figura en la tabla`); continue; }
  const gf = ps.reduce((s, p) => s + p.gc, 0), gc = ps.reduce((s, p) => s + p.gr, 0);
  // LarrySport a veces actualiza la tabla un rato después que los resultados: tolera 1 partido de diferencia
  if (Math.abs(fila.pj - ps.length) > 1 || (fila.pj === ps.length && (fila.gf !== gf || fila.gc !== gc))) tablas.push(`${eq}: tabla ${fila.pj} PJ ${fila.gf}-${fila.gc}, partidos ${ps.length} PJ ${gf}-${gc}`);
}
if (tablas.length) aviso(`${tablas.length} tablas no coinciden con los partidos: ${tablas.slice(0, 4).join('; ')}`); else ok.push('tablas coinciden con los partidos');

// 4. goleadores que suman más que los goles del equipo (incluye clásicos y copas)
const gol = [];
for (const [eq, e] of Object.entries(d.equipos)) {
  const o = (e.goleadores || []).reduce((s, g) => s + g.goles, 0);
  const gf = Ps.filter((p) => p.equipo === eq && p.gc != null && !p.copa).reduce((s, p) => s + p.gc, 0);
  if (o > gf) gol.push(`${eq}: ${o} goles de goleadores, ${gf} del equipo`);
}
if (gol.length) aviso(`Goleadores que no cierran: ${gol.join('; ')}`); else ok.push('goleadores cierran con los goles de cada equipo');

// 5. equipos que perdieron todos sus partidos de golpe o quedaron sin plantel
const sinPartidos = Object.keys(d.equipos).filter((eq) => !Ps.some((p) => p.equipo === eq));
if (sinPartidos.length) aviso(`Equipos sin partidos: ${sinPartidos.join(', ')}`);
const J = Object.values(d.jugadores || {});
const sinPlantel = Object.keys(d.equipos).filter((eq) => !J.some((j) => j.equipo === eq));
if (sinPlantel.length) aviso(`Equipos sin plantel: ${sinPlantel.join(', ')}`); else ok.push('todos los equipos tienen plantel');

const resumen = [`### Control de datos`, '', `${Object.keys(d.equipos).length} equipos · ${Ps.length} partidos · ${J.length} jugadores · ${Object.keys(d.tablas || {}).length} tablas`, '',
  ...avisos.map((a) => `- ⚠️ ${a}`), ...ok.map((o) => `- ✅ ${o}`)].join('\n');
console.log(resumen);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + '\n');
process.exit(0);
