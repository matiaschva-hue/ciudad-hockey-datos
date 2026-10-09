# Ciudad Hockey · datos

Alimenta https://ciudad-hockey.web.app (Firestore del proyecto muni-hockey, colecciones `ccba_*`).

- `larry.mjs` lee la web pública de LarrySport (Tournament Tracker AHBA) filtrada por el club CIUDAD: torneos, fixture, resultados y tablas.
- `planillas.mjs` baja las planillas PDF de cada partido y arma los planteles (número, nombre, PJ, goles, cuerpo técnico; sin carnets).
- `goleadores.mjs` lee la pestaña Goleadores de cada torneo (Caballeros A y B comparten torneo: las filas se reparten por tira con los PJ de las planillas).
- `subir.mjs` sube todo a Firestore con ids estables y borra lo que ya no existe. Si un torneo no se pudo leer, quedan sus datos anteriores; si faltan de golpe más del 30 % de los partidos, no sube nada (cambio de temporada: correr con `FORZAR=1`).
- `comun.mjs`: comparación de nombres (incluye los nombres cortados con "..." de las planillas) y reparto de goleadores A/B.

La tarea `.github/workflows/actualizar.yml` corre sola: fixture y resultados cada 3 h de sábado a lunes; torneos y planteles los martes.
A mano: pestaña Actions → "Actualizar Ciudad Hockey" → Run workflow (elegir fixture / planteles).
