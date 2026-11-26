// Limpia ccba_padron/datos (se lee sin login): deja solo lo publicable, igual que padron.mjs hoy.
//  - 18 o más: día y mes del cumpleaños («cumple»: "MM-DD"), sin el año.
//  - menores: nada de la fecha; solo la categoría si estaba.
// El documento publicado el 13/10 tenía la fecha de nacimiento entera (con año), también de menores.
// Uso: node limpiar_padron.mjs            → muestra qué cambiaría y guarda una copia local (no escribe)
//      node limpiar_padron.mjs --aplicar  → escribe la versión limpia (pide el OK del dueño)
import fs from 'fs';
// misma regla que publicable() de padron.mjs (no se importa: padron.mjs corre al cargarse)
function publicable(c, hoy = new Date()) {
  const [y, mo, d] = c.nacimiento.split('-').map(Number);
  const yaCumplio = hoy.getMonth() + 1 > mo || (hoy.getMonth() + 1 === mo && hoy.getDate() >= d);
  const edad = hoy.getFullYear() - y - (yaCumplio ? 0 : 1); // edad hoy: desde los 18
  return edad >= 18 ? { cumple: c.nacimiento.slice(5) } : { categoria: c.categoria || null };
}
const APLICAR = process.argv.includes('--aplicar');
const { initializeApp } = await import('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');
const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
const ref = doc(db, 'ccba_padron', 'datos'), snap = await getDoc(ref);
if (!snap.exists()) { console.log('No hay ccba_padron/datos'); process.exit(0); }
const original = JSON.parse(snap.data().json), personas = original.personas || {};
const copia = 'copias/padron-antes-de-limpiar-' + new Date().toISOString().slice(0, 10) + '.json';
fs.mkdirSync('copias', { recursive: true }); if (!fs.existsSync(copia)) fs.writeFileSync(copia, JSON.stringify(original));
const limpio = {}, c = { mayores: 0, menores: 0, yaLimpio: 0 };
for (const [k, p] of Object.entries(personas)) {
  if (p.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(p.nacimiento)) { const r = publicable({ nacimiento: p.nacimiento, categoria: p.categoria }); limpio[k] = r; r.cumple ? c.mayores++ : c.menores++; }
  else { const r = {}; if (p.cumple) r.cumple = String(p.cumple).slice(-5); if (p.categoria) r.categoria = p.categoria; limpio[k] = r; c.yaLimpio++; }
}
const quedanAnios = Object.values(limpio).filter((p) => JSON.stringify(p).match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/)).length;
console.log(`${Object.keys(personas).length} personas · ${c.mayores} pasan a día y mes · ${c.menores} menores pierden la fecha · ${c.yaLimpio} ya estaban limpias · fechas con año que quedan: ${quedanAnios}`);
console.log('Copia del original (privada, no se sube a GitHub):', copia);
if (!APLICAR) { console.log('Modo prueba: no se escribió nada. Para aplicarlo: node limpiar_padron.mjs --aplicar'); process.exit(0); }
await setDoc(ref, { json: JSON.stringify({ ...original, v: 2, limpiado: new Date().toISOString(), personas: limpio }), actualizado: new Date().toISOString() });
const vuelta = JSON.parse((await getDoc(ref)).data().json);
console.log('Escrito. Personas con fecha con año en la base ahora:', Object.values(vuelta.personas).filter((p) => /^\d{4}-/.test(p.nacimiento || '')).length);
process.exit(0);
