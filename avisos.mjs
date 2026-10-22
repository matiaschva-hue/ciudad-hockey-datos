// Avisos al celular del CM (Web Push con VAPID): qué publicar hoy, qué viene mañana / el finde, semana de play off,
// resultados con goleadores apenas los carga LarrySport y pedidos para usar Ciudad Studio.
// Corre al final de cada pasada del robot (y solo, en horarios fijos). No repite: lo enviado queda en ccba_push_log/datos.
// Uso: node avisos.mjs [--seco]   (necesita VAPID_PRIVATE; --seco muestra los avisos sin mandarlos)
import webpush from 'web-push';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { fechasDe } from './fechas_importantes.mjs';

const SECO = process.argv.includes('--seco');
const PUBLICA = 'BA79sCqx1e-o3MMbC_P1kirSLPC3MEb3_5HFrJyOj7ihjvJblCBYg8k-0Nus0aoHEP-E7aRPNSZPAEyJ7rtCPs8';
const PRIVADA = process.env.VAPID_PRIVATE || '';
if (!PRIVADA && !SECO) { console.log('Avisos: falta el secreto VAPID_PRIVATE, no se manda nada.'); process.exit(0); }
if (PRIVADA) webpush.setVapidDetails('https://ciudad-hockey.web.app', PUBLICA, PRIVADA);
const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));

// fechas en hora argentina
const ahora = new Date(Date.now() - 3 * 36e5), hora = process.env.HORA ? +process.env.HORA : ahora.getUTCHours(), minuto = process.env.HORA ? 47 : ahora.getUTCMinutes(), dow = ahora.getUTCDay(); // HORA=9 para probar
const dia = (d) => new Date(ahora.getTime() + d * 864e5).toISOString().slice(0, 10), hoy = dia(0), ayer = dia(-1), manana = dia(1);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIVN = { primera: 'Primera', intermedia: 'Intermedia', segunda: 'Segunda', cuarta: 'Cuarta', quinta: 'Quinta', sexta: 'Sexta', septima: 'Séptima' };
const CLAVE = /final|semi|cuarto|octavo|play ?off|reclasif|desempate/i;

const leer = async (c, d) => { const s = await getDoc(doc(db, c, d)); return s.exists() ? s.data() : null; };
const paq = JSON.parse((await leer('ccba_cache', 'datos'))?.json || '{}'), E = paq.equipos || {}, P = Object.entries(paq.partidos || {}).map(([id, p]) => ({ id, ...p }));
const perfiles = JSON.parse((await leer('ccba_perfiles', 'datos'))?.json || '{}').perfiles || [];
const log = (await leer('ccba_push_log', 'datos'))?.enviados || {}, primeraVez = !Object.keys(log).length;
const hechos = (await leer('ccba_config', 'bandeja'))?.hechos || {}; // lo que el CM ya subió (Ciudad Studio)
// resultados de un día que todavía no se subieron (por rama, igual que en Para publicar)
const sinSubir = (f) => P.filter((p) => p.fecha === f && p.gc != null && !hechos[`res|${f}|${(E[p.equipo] || {}).rama}`]);

const equipoTxt = (id) => { const e = E[id] || {}; const tira = e.rama === 'damas' && e.div === 'segunda' ? `Segunda ${e.tira}` : `${e.rama === 'damas' ? 'Damas' : 'Caballeros'} ${e.tira}`; return `${tira} · ${DIVN[e.div] || ''}`; };
const res = (p) => (p.gc > p.gr ? 'Ganó' : p.gc < p.gr ? 'Perdió' : 'Empató');
// "Vensentini Callioni Manuel" (planilla) → "Vensentini Callioni", con el perfil ("Manuel Vensentini Callioni") para saber dónde termina el apellido
const pl = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function apellido(nombre, rama) {
  const corto = /\.{2,}\s*$/.test(nombre); let W = nombre.replace(/\.{2,}\s*$/, '').trim().split(/\s+/); if (corto && W.length > 2) W = W.slice(0, -1);
  const Wn = W.map(pl), c = perfiles.filter((x) => x.rama === rama && (() => { const w = pl(x.nombre).split(/\s+/); return Wn.every((p) => w.includes(p)) && (corto || w.length === Wn.length); })());
  // "M. Vensentini Callioni": inicial del primer nombre + apellido (hay hermanos en el club)
  if (c.length === 1) { const Q = pl(c[0].nombre).split(/\s+/); for (let k = corto ? Wn.length : Wn.length - 1; k >= 1; k--) if (Wn.slice(0, k).join(' ') === Q.slice(-k).join(' ')) return `${c[0].nombre[0].toUpperCase()}. ${W.slice(0, k).join(' ')}`; }
  return corto ? W.join(' ') : `${W[1][0].toUpperCase()}. ${W[0]}`;
}
const golesTxt = (p) => (p.goleadores || []).slice().sort((a, b) => b.goles - a.goles).map((j) => apellido(j.nombre, (E[p.equipo] || {}).rama) + (j.goles > 1 ? ` ×${j.goles}` : '')).join(', ');
const partidoTxt = (p) => `${equipoTxt(p.equipo)}${p.hora ? ' ' + p.hora + ' h' : ''} vs ${p.rival} (${p.local === false ? 'V' : 'L'})`;

// por ahora (pedido del CM) solo se avisa cuando termina un partido y cuando llega la planilla; AVISOS_TODOS=1 vuelve a mandar el resto
const TODOS = !!process.env.AVISOS_TODOS;
const avisos = []; // { clave, titulo, texto, url }
const nuevo = (clave, titulo, texto, url = './#/redes') => { if (![].concat(clave).every((k) => log[k])) avisos.push({ clave, titulo, texto, url }); };

// 1) pedidos para usar Ciudad Studio
if (TODOS) try {
  const s = await getDocs(query(collection(db, 'ccba_studio_usuarios'), where('estado', '==', 'pendiente')));
  for (const d of s.docs) { const u = d.data(); nuevo(`acc|${d.id}`, 'Pedido para Ciudad Studio', `${u.nombre || u.email} quiere armar posteos. Tocá para habilitarlo.`); }
} catch (e) { console.log('pedidos:', e.message); }

// 2) resultados nuevos (con goleadores si la planilla ya está)
const nuevosRes = P.filter((p) => p.fuente === 'larry' && p.gc != null && p.fecha >= dia(-2) && p.fecha <= hoy && !log[`res|${p.id}`]);
if (nuevosRes.length > 4) avisos.push({ clave: nuevosRes.map((p) => `res|${p.id}`), titulo: `Resultados · ${nuevosRes.length} partidos`, texto: nuevosRes.slice(0, 6).map((p) => `${equipoTxt(p.equipo)}: ${p.gc}-${p.gr} ${p.rival}`).join(' · '), url: './#/redes' });
else for (const p of nuevosRes) nuevo(golesTxt(p) ? [`res|${p.id}`, `gol|${p.id}`] : `res|${p.id}`, `Terminó: ${res(p)} ${equipoTxt(p.equipo)} ${p.gc}-${p.gr}`, `Ciudad ${p.gc}-${p.gr} ${p.rival}${golesTxt(p) ? ` · Goles: ${golesTxt(p)}` : ''}. Armá el posteo de resultado.`, `./#/p/${p.id}`);

// goles: cuando LarrySport sube la planilla después del resultado, segundo aviso con los goleadores
{ const conGoles = P.filter((p) => p.fuente === 'larry' && p.gc != null && p.fecha >= dia(-3) && (p.goleadores || []).length && (log[`res|${p.id}`] || nuevosRes.includes(p)) && !log[`gol|${p.id}`] && !(nuevosRes.length <= 4 && nuevosRes.includes(p)));
  if (conGoles.length > 4) avisos.push({ clave: conGoles.map((p) => `gol|${p.id}`), titulo: `Planillas · goles de ${conGoles.length} partidos`, texto: conGoles.slice(0, 4).map((p) => `${equipoTxt(p.equipo)}: ${golesTxt(p)}`).join(' · '), url: './#/redes' });
  else for (const p of conGoles) nuevo(`gol|${p.id}`, `Goles · ${equipoTxt(p.equipo)} ${p.gc}-${p.gr}`, `Ya está la planilla: ${golesTxt(p)}. Armá el posteo de resultado con los goleadores.`, `./#/p/${p.id}`); }

// fotos nuevas de Hockey MUNI HD para revisar en Ciudad Studio (las baja la rutina de la compu del CM)
if (TODOS) try {
  const fotos = await (await fetch('https://ciudad-hockey.web.app/fotos.json?t=' + Date.now())).json(), rev = (await leer('ccba_config', 'fotos')) || {};
  const pend = fotos.filter((f) => f.pendiente && !(rev.ok || {})[f.src] && !(rev.no || {})[f.src]);
  if (pend.length) { const ult = pend.map((f) => f.nueva || '').sort().pop();
    nuevo(`fotos|${ult}`, 'Fotos nuevas para revisar', `${pend.length} fotos de Hockey MUNI HD (${[...new Set(pend.map((f) => f.partido))].slice(0, 2).join(' · ')}). Tocá ✓ en las que quieras usar.`); }
} catch (e) { console.log('fotos:', e.message); }

// cumpleaños (plantel superior, temporada actual o la anterior) — igual que el Studio
const cumples = (f) => perfiles.filter((p) => p.nacimiento && p.nacimiento.slice(5) === f.slice(5)).filter((p) => { const ult = Math.max(...(p.temporadas || []).map((t) => t.anio)); return ult >= +f.slice(0, 4) - 1 && (p.temporadas || []).some((t) => t.anio === ult && ['primera', 'intermedia'].includes(t.div)); });
const juegan = (f) => P.filter((p) => p.fecha === f && p.gc == null && !p.suspendido);

// 3) a la mañana: qué publicar hoy
if (TODOS && hora >= 8 && hora < 13) {
  const L = [], cs = cumples(hoy), hj = juegan(hoy), ra = P.filter((p) => p.fecha === ayer && p.gc != null);
  if (cs.length) nuevo(`cum|${hoy}`, `🎂 Hoy ${cs.length > 1 ? 'cumplen' : 'cumple'} ${cs.map((p) => p.nombre).join(', ')}`, 'Armá el posteo de cumpleaños en Ciudad Studio (ya tiene su foto si la cargaste).');
  if (hj.length) L.push(`Hoy juegan ${hj.length}: ${hj.slice(0, 3).map(partidoTxt).join(' · ')}${hj.length > 3 ? '…' : ''}`);
  const pa = sinSubir(ayer); if (pa.length) L.push(`Te quedaron pendientes los resultados de ayer (${pa.length})`);
  const po = P.filter((p) => p.gc == null && p.fecha > hoy && p.fecha <= dia(7) && (CLAVE.test(p.fechaN || '') || CLAVE.test(p.torneo || '')));
  if (po.length && [1, 3].includes(dow)) L.push(`Semana de play off: armá la previa (${[...new Set(po.map((p) => p.fechaN || p.torneo))].slice(0, 2).join(', ')})`);
  if (L.length) nuevo(`dia|${hoy}`, 'Para publicar hoy', L.join(' · '));
}
// 3b) antes de cada partido: entre 15 y 75 minutos antes de que arranque (los del mismo horario van juntos)
if (TODOS) { const ya = hora * 60 + minuto, porHora = {};
  for (const p of juegan(hoy)) { if (!/^\d{1,2}:\d{2}/.test(p.hora || '')) continue; const [h, m] = p.hora.split(':').map(Number), falta = h * 60 + m - ya; if (falta >= 15 && falta <= 75) (porHora[p.hora] ||= []).push(p); }
  for (const [h, ps] of Object.entries(porHora)) nuevo(ps.map((p) => `pre|${p.id}`), `A las ${h} h juega Ciudad${ps.length > 1 ? ` (${ps.length} partidos)` : ''}`, ps.slice(0, 3).map((p) => `${equipoTxt(p.equipo)} vs ${p.rival} (${p.local === false ? 'V' : 'L'})`).join(' · ') + '. Subí la previa o la historia de «hoy juega».', ps.length === 1 ? `./#/p/${ps[0].id}` : './#/redes'); }
// 4) a la tarde: lo que viene mañana o el finde
if (TODOS && hora >= 18 && hora < 23) {
  const L = [], cm = cumples(manana), ph = sinSubir(hoy);
  if (ph.length) L.push(`Falta subir los resultados de hoy (${ph.length})`);
  if (dow === 4 || dow === 5) { // jueves y viernes: el finde
    const fin = (dow === 4 ? [1, 2, 3] : [1, 2]).flatMap((d) => juegan(dia(d))); // jueves: vie+sáb+dom · viernes: sáb+dom
    if (fin.length) L.push(`Este finde juegan ${fin.length} partidos: armá el posteo de próximos`);
  } else { const jm = juegan(manana); if (jm.length) L.push(`Mañana ${DIAS[(dow + 1) % 7]} juegan ${jm.length}: ${jm.slice(0, 2).map(partidoTxt).join(' · ')}${jm.length > 2 ? '…' : ''}`); }
  if (cm.length) L.push(`Mañana cumple ${cm.map((p) => p.nombre).join(', ')}`);
  const clave = juegan(manana).filter((p) => CLAVE.test(p.fechaN || '') || CLAVE.test(p.torneo || ''));
  if (clave.length) L.push(`Partido clave mañana: ${clave[0].fechaN || clave[0].torneo}`);
  if (L.length) nuevo(`noche|${hoy}`, 'Para preparar', L.join(' · '));
}

// 5) cumpleaños (plantel superior y jugadores/as destacados/as) y fechas importantes: a la mañana del día y la noche anterior (pedido del CM, 22/10)
let leyendas = []; // de la web: fechas de nacimiento (NAC_LEY) y nombres (LEY("id", "Nombre"))
try { const js = await (await fetch('https://ciudad-hockey.web.app/app.js?t=' + Date.now())).text(), nac = JSON.parse((/const NAC_LEY = (\{[^}]*\})/.exec(js) || [])[1] || '{}');
  leyendas = [...js.matchAll(/LEY\("([a-z-]+)", "([^"]+)"/g)].filter((m) => nac[m[1]]).map((m) => ({ id: m[1], nombre: m[2], nacimiento: nac[m[1]] })); } catch (e) { console.log('leyendas:', e.message); }
const sinTilde = (s) => pl(s).split(/\s+/);
const cumpleDe = (f) => { const ls = leyendas.filter((l) => l.nacimiento.slice(5) === f.slice(5)), lsN = ls.map((l) => sinTilde(l.nombre));
  const ps = cumples(f).filter((p) => !lsN.some((L) => L.every((w) => sinTilde(p.nombre).includes(w)))); // quien es leyenda no se repite
  return [...ls.map((l) => `${l.nombre} (destacado/a del club)`), ...ps.map((p) => p.nombre)]; };
if (hora >= 8 && hora < 13) {
  const cs = cumpleDe(hoy), fs = fechasDe(hoy);
  if (cs.length) nuevo(`cum|${hoy}`, `🎂 Hoy ${cs.length > 1 ? 'cumplen' : 'cumple'} ${cs.join(', ')}`, 'Armá el posteo de cumpleaños en Ciudad Studio.');
  for (const x of fs) nuevo(`fecha|${hoy}|${x.titulo}`, `📅 Hoy: ${x.titulo}`, `Idea: ${x.idea}.`);
}
if (hora >= 19 && hora < 23) {
  const cs = cumpleDe(manana), fs = fechasDe(manana), L = [];
  if (cs.length) L.push(`cumple ${cs.join(', ')}`); for (const x of fs) L.push(`${x.titulo} (${x.idea})`);
  if (L.length) nuevo(`manana|${hoy}`, '🗓️ Mañana', L.join(' · ') + '. Dejalo preparado en Ciudad Studio.');
}

// envío
const claves = (a) => (Array.isArray(a.clave) ? a.clave : [a.clave]);
if (primeraVez && !process.env.PRUEBA) { console.log('Avisos: primera corrida, se marca lo actual como enviado sin mandar nada.'); for (const a of avisos) if (!/^acc\|/.test(claves(a)[0])) for (const k of claves(a)) log[k] = hoy; avisos.splice(0, avisos.length, ...avisos.filter((a) => /^acc\|/.test(claves(a)[0]))); for (const p of P.filter((p) => p.gc != null && p.fecha >= dia(-3))) { log[`res|${p.id}`] = hoy; log[`gol|${p.id}`] = hoy; } }
const subs = (await getDocs(collection(db, 'ccba_push'))).docs;
console.log(`Avisos: ${avisos.length} para mandar a ${subs.length} dispositivo(s)`);
for (const a of avisos) {
  console.log(' ·', a.titulo, '—', a.texto);
  if (SECO) continue;
  for (const s of subs) {
    try { await webpush.sendNotification(JSON.parse(s.data().sub), JSON.stringify({ titulo: a.titulo, texto: a.texto, url: a.url, tag: claves(a)[0] }), { TTL: 6 * 3600 }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { await deleteDoc(s.ref); console.log('   dispositivo dado de baja'); } else console.log('   no se pudo mandar:', e.statusCode || e.message); }
  }
  for (const k of claves(a)) log[k] = hoy;
}
// se guardan las últimas dos semanas
const lim = dia(-14); for (const [k, f] of Object.entries(log)) if (f < lim) delete log[k];
if (!SECO) await setDoc(doc(db, 'ccba_push_log', 'datos'), { enviados: log, actualizado: new Date().toISOString() });
process.exit(0);
