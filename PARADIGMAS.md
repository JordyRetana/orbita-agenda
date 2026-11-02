# Paradigmas aplicados en Órbita

## Imperativo

`server/api.js` expresa los pasos de cada operación: recibir la solicitud, validar, modificar el estado, recalcular prioridad, persistir y devolver el resultado. `server/store.js` ejecuta transacciones SQL con inicio, inserciones, commit o rollback.

## Orientado a objetos

`Planner` en `server/planner.js` encapsula el estado que necesita el planificador y expone `analyze` y `redistribute`. El resto de la aplicación usa esa abstracción sin conocer los detalles del cálculo. Usuario, curso, tarea, sesión y recomendación son entidades con estructura y responsabilidades separadas; no se crean clases vacías solo para aparentar POO.

## Funcional

`remaining`, `scoreTask`, `datePlus` e `infer` transforman entradas en resultados sin modificar sus argumentos. Map, filter, reduce y ordenamiento sobre copias producen estadísticas y recomendaciones. Las pruebas comprueban que el análisis no modifica el estado recibido.

## Lógica por reglas

`server/rules.js` declara hechos, premisas y conclusiones. El motor `infer` usa encadenamiento hacia delante hasta que ya no se derivan hechos nuevos. Ejemplo:

1. Días para entregar ≤ 1, avance < 50 y trabajo pendiente > 0 implican `deadlineRisk`.
2. `deadlineRisk` e importancia ≥ 4 implican `startToday`.
3. Horas planificadas > capacidad implican `overload`.

Las reglas también detectan concentración de exámenes y actividades sin programar. El análisis devuelve las reglas que dispararon cada recomendación. Es un motor de inferencia implementado en JavaScript; no es una implementación de Prolog. Si el docente exige específicamente Prolog, debe aclararse ese requisito.

## Declarativo

React describe las vistas según el estado: calendario, lista de pendientes, formularios, avance, alertas y recomendaciones. Los componentes no manipulan el DOM para insertar filas manualmente. CSS define las adaptaciones entre escritorio y teléfono.

## Fórmula de prioridad

La puntuación máxima es 100: cercanía de entrega 35, importancia 20, dificultad 15, trabajo pendiente 15, avance pendiente 10 y carga próxima 5. Urgente ≥ 80, alta ≥ 65, media ≥ 40 y baja < 40. Las completadas tienen prioridad y trabajo pendiente cero.

La fórmula y el motor de reglas trabajan en el backend. Groq recibe los resultados para explicar y sugerir una distribución, sin cambiar puntuaciones.
