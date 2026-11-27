// Saca el mail de las suscripciones de avisos (ccba_push se lee sin login y el robot no usa el mail). Deja la suscripción y el uid.
// Uso: node limpiar_push.mjs            → muestra cuántas tienen mail
//      node limpiar_push.mjs --aplicar  → borra el campo email
const APLICAR = process.argv.includes('--aplicar');
const { initializeApp } = await import('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, deleteField } = await import('firebase/firestore');
const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
const ds = (await getDocs(collection(db, 'ccba_push'))).docs.filter((d) => 'email' in d.data());
console.log(`${ds.length} suscripción(es) con mail`);
if (APLICAR) { for (const d of ds) await updateDoc(d.ref, { email: deleteField() }); const quedan = (await getDocs(collection(db, 'ccba_push'))).docs.filter((d) => 'email' in d.data()).length; console.log('Listo. Con mail ahora:', quedan); }
process.exit(0);
