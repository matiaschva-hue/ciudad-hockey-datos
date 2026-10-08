// Sube larry_data.json (lo que leyó larry.mjs) al Firestore de 3T, colecciones ccba_*.
// Partidos con id estable (se actualizan en cada pasada); los de LarrySport que ya no existen se borran.
// Uso: node subir.mjs [--seco] [--solo-paquete]   (--seco: muestra lo que haría, sin escribir; --solo-paquete: solo arma ccba_cache/datos)
// La web lee UN documento (ccba_cache/datos) con todo junto: ~4 lecturas por visita en vez de ~1800 (cuota gratuita: 50.000/día).
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

const SECO = process.argv.includes('--seco');
const data = JSON.parse(fs.readFileSync(new URL('larry_data.json', import.meta.url), 'utf8'));
const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));

const DIV = { Primera: 'primera', Intermedia: 'intermedia', Segunda: 'segunda', Cuarta: 'cuarta', Quinta: 'quinta', Sexta: 'sexta', Septima: 'septima' };
const esCiudad = n => /^CIUDAD(?: ([A-H]))?$/i.exec((n || '').trim());
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hoy = new Date(); const actualizada = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`;

const equipos = {}, partidos = {}, tablas = {};
for (const t of data.torneos) {
  const div = DIV[t.cat]; if (!div) continue;
  const copa = /copa/i.test(t.nombre);
  const idsTorneo = new Set();
  for (const p of t.partidos) {
    const cl = esCiudad(p.local), cv = esCiudad(p.visitante);
    if (!cl && !cv) continue;
    if (cl && cv) continue; // Ciudad vs Ciudad (A vs B): se omite para no duplicar
    // Proyección (5ª tira de 7ma) figura como "CIUDAD" igual que la A: se la toma como tira E
    const tira = /proyecc/i.test(t.nombre) ? 'E' : ((cl || cv)[1] || 'A').toUpperCase();
    const eq = `${t.rama}-${div}-${tira.toLowerCase()}`;
    idsTorneo.add(eq);
    const rival = cl ? p.visitante : p.local;
    const id = `lp-${eq}-${slug(t.nombre)}-${p.fecha}-${slug(rival)}`;
    partidos[id] = { equipo: eq, fecha: p.fecha, hora: p.hora, rival, local: !!cl, sede: '', fechaN: p.fechaN || '',
      gc: cl ? p.gl : p.gv, gr: cl ? p.gv : p.gl, torneo: t.nombre, copa, fuente: 'larry' };
    if (!equipos[eq]) equipos[eq] = { rama: t.rama, div, tira, larry: true };
    if (!copa) equipos[eq].torneo = t.nombre;
  }
  if (!copa && t.tabla.length) for (const eq of idsTorneo) tablas[eq] = { filas: t.tabla.map(f => ({ equipo: f.equipo, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, gf: f.gf, gc: f.gc, pts: f.pts })), torneo: t.nombre, actualizada, fuente: 'larry' };
}

// planteles (de planillas.mjs): jugadores con id estable + cuerpo técnico en el equipo
const jugadores = {};
const plFile = new URL('planteles.json', import.meta.url);
if (fs.existsSync(plFile)) {
  const ROL = { T: 'Entrenador/a', A: 'Asistente', P: 'Prep. física', M: 'Médico/a' };
  for (const [eq, P] of Object.entries(JSON.parse(fs.readFileSync(plFile, 'utf8')))) {
    if (!equipos[eq]) continue;
    for (const j of P.jugadores) jugadores[`lp-${eq}-${slug(j.nombre)}`] = { equipo: eq, numero: j.numero, nombre: j.nombre, puesto: '', capitan: j.capitan, pj: j.pj, goles: j.goles, fuente: 'larry' };
    // "Apellido, Nombre" → "Nombre Apellido"; solo quien figura en al menos 2 planillas (o el único de su rol)
    const st = P.staff.filter((s, i, a) => s.n >= 2 || a.filter(x => x.rol === s.rol).length === 1);
    equipos[eq].cuerpo = st.map(s => ({ rol: ROL[s.rol] || s.rol, nombre: s.nombre.split(',').map(x => x.trim()).reverse().join(' ') }));
  }
}
// Menores que juegan para arriba: si un/a jugador/a figura en Quinta, Sexta o Séptima y también en una división
// más alta de la misma rama, su división es la más baja (por edad no se puede jugar más abajo). En las de arriba
// queda marcado/a como refuerzo de esa división. Entre Intermedia y Primera: es de donde jugó más partidos.
{
  const ORD = { septima: 0, sexta: 1, quinta: 2, cuarta: 3, intermedia: 4, primera: 5 };
  const nnj = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/s+/).filter(Boolean).sort().join(' ');
  const grupos = {};
  for (const [id, j] of Object.entries(jugadores)) { const [rama, div] = j.equipo.split('-'); if (!(div in ORD)) continue; (grupos[rama + '|' + nnj(j.nombre)] ||= []).push({ id, div }); }
  let n = 0;
  for (const g of Object.values(grupos)) {
    let menor = g.filter((x) => ORD[x.div] <= 2).sort((a, b) => ORD[a.div] - ORD[b.div])[0];
    // mayores (Intermedia / Primera): es de la división donde jugó más partidos (empate: la más baja)
    if (!menor) { const may = g.filter((x) => ORD[x.div] >= 4); if (new Set(may.map((x) => x.div)).size < 2) continue;
      menor = may.map((x) => ({ ...x, pj: +jugadores[x.id].pj || 0 })).sort((a, b) => b.pj - a.pj || ORD[a.div] - ORD[b.div])[0];
      for (const x of may) if (x.div !== menor.div) { jugadores[x.id].refuerzo = menor.div; n++; }
      continue; }
    for (const x of g) if (ORD[x.div] > ORD[menor.div]) { jugadores[x.id].refuerzo = menor.div; n++; }
  }
  console.log(n, 'apariciones de menores jugando en una división más alta (marcadas como refuerzo)');
}
console.log(Object.keys(jugadores).length, 'jugadores');

// goleadores oficiales (pestaña "Goleadores" de LarrySport, de goleadores.mjs): reemplazan a los goles leídos de las planillas
const golFile = new URL('goleadores.json', import.meta.url);
if (fs.existsSync(golFile)) {
  const nn = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const G = JSON.parse(fs.readFileSync(golFile, 'utf8'));
  for (const [eq, lista] of Object.entries(G)) {
    if (!equipos[eq]) continue;
    equipos[eq].goleadores = lista.map(({ nombre, goles, pj }) => ({ nombre, goles, pj }));
    const porNombre = new Map(lista.map((g) => [nn(g.apellidoNombre.replace(',', ' ')), g.goles]));
    for (const j of Object.values(jugadores)) if (j.equipo === eq) j.goles = porNombre.get(nn(j.nombre)) || 0;
  }
  console.log('goleadores oficiales en', Object.keys(G).length, 'equipos');
}

console.log(Object.keys(equipos).length, 'equipos,', Object.keys(partidos).length, 'partidos,', Object.keys(tablas).length, 'tablas');
for (const [id, e] of Object.entries(equipos)) console.log('  ', id, '·', e.torneo || '(solo copa)', '·', Object.values(partidos).filter(p => p.equipo === id).length, 'partidos');
if (SECO) process.exit(0);

// Paquete anterior (1 lectura): sirve para saber qué cambió y para conservar lo que esta corrida no trae
const refPaq = doc(db, 'ccba_cache', 'datos');
let prev = null;
try { const s = await getDoc(refPaq); if (s.exists()) prev = JSON.parse(s.data().json); } catch (e) { console.log('sin paquete anterior:', e.message); }
// planteles / goleadores / cuerpo técnico: si esta corrida no los trae (modo rápido), quedan los anteriores
for (const [id, e] of Object.entries(equipos)) { const p = prev?.equipos?.[id]; if (p) equipos[id] = { ...p, ...e }; }
const jugFinal = Object.keys(jugadores).length ? jugadores : (prev?.jugadores || {});
const paquete = { v: 1, actualizado: new Date().toISOString(), equipos, partidos, jugadores: jugFinal, tablas };
const json = JSON.stringify(paquete);
console.log('paquete:', Math.round(json.length / 1024), 'KB');
fs.writeFileSync(new URL('paquete.json', import.meta.url), json); // copia en archivo (respaldo para la web si Firestore no responde)
await setDoc(refPaq, { json, actualizado: paquete.actualizado });
if (process.argv.includes('--solo-paquete')) { console.log('Paquete subido.'); process.exit(0); }

// Colecciones (para la administración y la app 3T): solo lo que cambió respecto del paquete anterior
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const viejos = prev ? Object.keys(prev.partidos || {}).filter((id) => prev.partidos[id].fuente === 'larry' && !partidos[id])
  : (await getDocs(collection(db, 'ccba_partidos'))).docs.filter(d => d.data().fuente === 'larry' && !partidos[d.id]).map(d => d.id);
const ops = [
  ...Object.entries(equipos).filter(([id, o]) => !prev || !igual(prev.equipos?.[id], o)).map(([id, o]) => ['set', 'ccba_equipos', id, o, true]),
  ...Object.entries(partidos).filter(([id, o]) => !prev || !igual(prev.partidos?.[id], o)).map(([id, o]) => ['set', 'ccba_partidos', id, o, false]),
  ...Object.entries(tablas).filter(([id, o]) => !prev || !igual({ ...prev.tablas?.[id], actualizada: 0 }, { ...o, actualizada: 0 })).map(([id, o]) => ['set', 'ccba_tablas', id, o, false]),
  ...viejos.map(id => ['del', 'ccba_partidos', id]),
];
if (Object.keys(jugadores).length) {
  const jViejos = prev ? Object.keys(prev.jugadores || {}).filter((id) => !jugadores[id])
    : (await getDocs(collection(db, 'ccba_jugadores'))).docs.filter(d => d.data().fuente === 'larry' && !jugadores[d.id]).map(d => d.id);
  ops.push(...Object.entries(jugadores).filter(([id, o]) => !prev || !igual(prev.jugadores?.[id], o)).map(([id, o]) => ['set', 'ccba_jugadores', id, o, false]), ...jViejos.map(id => ['del', 'ccba_jugadores', id]));
}
for (let i = 0; i < ops.length; i += 450) {
  const b = writeBatch(db);
  for (const [op, col, id, o, merge] of ops.slice(i, i + 450)) op === 'del' ? b.delete(doc(db, col, id)) : b.set(doc(db, col, id), o, merge ? { merge: true } : {});
  await b.commit();
}
console.log('Subido:', ops.length, 'escrituras', viejos.length ? `(${viejos.length} partidos viejos borrados)` : '');
process.exit(0);
