# Ciudad Hockey · datos

Alimenta https://ciudad-hockey.web.app (Firestore del proyecto muni-hockey, colecciones `ccba_*`).

- `larry.mjs` lee la web pública de LarrySport (Tournament Tracker AHBA) filtrada por el club CIUDAD: torneos, fixture, resultados y tablas.
- `planillas.mjs` baja las planillas PDF de cada partido y arma los planteles (número, nombre, PJ, goles, cuerpo técnico; sin carnets).
- `goleadores.mjs` lee la pestaña Goleadores de cada torneo (Caballeros A y B comparten torneo: las filas se reparten por tira con los PJ de las planillas).
- `subir.mjs` sube todo a Firestore con ids estables y borra lo que ya no existe. Si un torneo no se pudo leer, quedan sus datos anteriores; si faltan de golpe más del 30 % de los partidos, no sube nada (cambio de temporada: correr con `FORZAR=1`).
- `comun.mjs`: comparación de nombres (incluye los nombres cortados con "..." de las planillas) y reparto de goleadores A/B.

La tarea `.github/workflows/actualizar.yml` corre sola: fixture y resultados cada 3 h de sábado a lunes; torneos y planteles los martes.
A mano: pestaña Actions → "Actualizar Ciudad Hockey" → Run workflow (elegir fixture / planteles).

## Temporadas anteriores (2022–2025)

En LarrySport los años anteriores no se pueden buscar por club, pero adentro de cada torneo el filtro de Ciudad sí funciona. `TEMPORADA=2024 node larry.mjs todo` entra sin club, recorre todos los torneos de cada categoría (Primera a Novena), lee los de Ciudad y sus goleadores. `node historico.mjs subir 2024` guarda la temporada en `ccba_historico/2024` (un documento por año, aparte del paquete actual).
No hay planillas: sin planteles, y en Caballeros (A y B en el mismo torneo) los goleadores quedan por torneo. En Octava y Novena LarrySport no carga resultados.
A mano: Actions → Run workflow → modo `historico` (o `historico-prueba`, que no sube) y la temporada. Tarda 2 a 4 h.
