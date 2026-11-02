# Órbita — agenda académica

Aplicación React con API compatible con Node.js y Cloudflare Workers, calendario en escritorio y agenda adaptada al teléfono. Base MySQL **en línea en Aiven**, con TLS y certificado CA verificado. Disponible en **https://orbita-agenda.jretanamendez.workers.dev** y en **http://127.0.0.1:4173** para desarrollo.

## Abrir y ejecutar

Requiere Node.js 20.19+ o 22.12+ y conexión a internet para Aiven y Groq.

```powershell
npm install
npm run build
npm start
```

Copia `.env.example` a `.env` y configura tus credenciales. La configuración privada está ignorada por Git. No compartirla ni incluirla en entregas. Obtén el certificado CA de tu proveedor y guárdalo en `certs/aiven-ca.pem`. `.env.example` contiene solo los nombres de configuración.

Las variables ya definidas en el proceso tienen prioridad sobre `.env`. El servidor de desarrollo escucha exclusivamente en `127.0.0.1`; la publicación pública usa Cloudflare Workers.

## Funciones

- Calendario de día, semana y mes; calendario pequeño para elegir fechas, navegación de periodos, botón Hoy, búsqueda y filtros por curso.
- Crear, editar, eliminar y completar actividades; tipo, curso, entrega, dificultad, importancia, estimación y avance.
- Crear, editar y eliminar cursos. Eliminar un curso con actividades requiere confirmación de la eliminación relacionada.
- Sesiones con fecha, inicio y duración. Doble clic en un espacio crea una sesión; doble clic en un bloque la edita. Arrastrar bloques cambia día/hora; arrastrar el borde inferior ajusta duración. También se puede programar desde el detalle de una actividad, sin arrastrar.
- Validación de cruces, fechas reales, fecha límite, actividad pendiente y horario entre 08:00 y 22:00.
- Priorización propia de 0 a 100 con factores visibles y explicación. La IA no decide las puntuaciones.
- Disponibilidad configurable, redistribución automática por prioridad y entrega, detección de carga y trabajo sin suficiente espacio.
- Estadísticas de completadas, pendientes, horas por curso, carga diaria y distribución por prioridad.
- Temporizador de enfoque con pausa, reinicio y finalización de la actividad.
- Registro, inicio y cierre de sesión; contraseñas protegidas con scrypt, cookies HttpOnly/SameSite y datos separados por usuario.
- Recomendaciones con Groq, preguntas sobre el plan e historial en MySQL.
- Exportación de respaldo JSON sin credenciales y PWA instalable.

## Cuentas y datos existentes

La aplicación abre la pantalla de acceso. Se puede crear una cuenta con correo y contraseña o entrar con Google o GitHub. Las cuentas nuevas empiezan vacías; Configuración permite cargar ejemplos opcionales si aún no tienen cursos ni actividades. Cada cuenta mantiene su propia agenda, preferencias e identidades vinculadas. Cerrar sesión vuelve a la pantalla de acceso y limpia la copia personal del navegador. Los datos del prototipo anterior se conservan en la base y no son accesibles de forma anónima.

## MySQL en Aiven

Se utiliza una base separada `orbita` dentro del servicio gratuito existente del usuario. No se modificó `defaultdb`. El esquema relacional incluye `users`, `preferences`, `courses`, `tasks`, `study_sessions`, `recommendations`, `auth_sessions`, `oauth_identities` y `oauth_flows`. Ver `server/schema.sql`. Las modificaciones del plan se guardan en transacciones.

La configuración local usa `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` y `MYSQL_SSL_CA`. El certificado se valida con `rejectUnauthorized: true`; no se desactivó TLS. Una copia sin MySQL puede guardar cuentas con contraseña en `data/workspace.json`, pero Google y GitHub requieren MySQL para sus flujos. La instalación configurada en este equipo y la publicación usan MySQL/Aiven.

## IA

La API de Groq se consulta exclusivamente desde el servidor, local o Worker. Usa `GROQ_API_KEY` y `GROQ_MODEL=openai/gpt-oss-20b`. Se verificó una respuesta real con ese modelo; el modelo Llama anterior no estaba disponible en esta cuenta. No hay claves en React ni en los archivos compilados.

La IA recibe datos académicos del plan (títulos, fechas, horas y prioridades calculadas). Explica y prepara propuestas que requieren confirmación para guardarse; no reemplaza el algoritmo. Si falla, la app muestra el error y ofrece reintentar. No presenta una explicación local como si fuera IA. Las respuestas se guardan con fuente, modelo, prioridad y fecha.

## PWA y conexión

`npm run build` genera el service worker con los recursos exactos de la compilación. Se puede instalar desde Chrome/Edge o agregar a inicio desde Safari en iPhone. La instalación requiere localhost o HTTPS.

En Configuración, «Añadir Órbita a mi dispositivo» llama directamente al aviso nativo mediante el evento `beforeinstallprompt` cuando está disponible. Se comprueba la elección del usuario, se maneja la cancelación y el estado solo se marca instalado al recibir `appinstalled` o al ejecutarse en modo standalone. Si el navegador no ofrece ese evento, se muestra la ruta específica de su plataforma. iOS exige usar el menú de Safari; no hay instalación silenciosa ni un aviso programático universal. Los iconos de inicio de iOS están definidos en la página.


Sin conexión, se abre la interfaz y el último plan guardado de esta sesión del navegador. Editar y consultar IA requieren conexión. No se prometen escrituras offline ni sincronización de cambios pendientes. Al cerrar sesión se elimina la copia local del plan previo. Los cambios de diseño requieren recargar la pestaña.

## Pruebas

```powershell
npm test
npm run test:integration
```

Las pruebas unitarias cubren prioridad, horas, reglas encadenadas, capacidad, entregas, cruces y edición de sesiones. La integración requiere el servidor activo y `.env`; crea cuentas temporales con prefijo QA, comprueba MySQL y Groq reales y elimina esas cuentas al terminar. El informe está en `verification-api.json`. Las capturas y el registro de revisión de interfaz están en `verification/`.


## Paradigmas

Ver `PARADIGMAS.md` para el mapa entre requisitos del curso y código: imperativo, orientado a objetos, funcional, lógica por reglas y declarativo.

## Publicación en Cloudflare

Dirección: https://orbita-agenda.jretanamendez.workers.dev

El frontend y las rutas API se publican juntos con `npm run deploy`. `cloudflare/worker.js` adapta la API Express al entorno Workers. MySQL sigue en Aiven y se conecta mediante el binding Hyperdrive `MYSQL`, con verificación de identidad y certificado de Aiven. La caché de consultas está desactivada. Las operaciones de escritura usan transacciones y bloqueos por usuario para evitar sobrescribir cambios simultáneos. Las claves no forman parte del frontend: `GROQ_API_KEY` es un secreto de Workers y las credenciales MySQL están cifradas dentro de Hyperdrive.

El acceso requiere iniciar sesión o crear una cuenta, tanto en localhost como en la web. Cada persona comienza con una agenda vacía; los cursos, las actividades, las sesiones, la disponibilidad y las recomendaciones se consultan y guardan por usuario. La cuenta de ejemplos anterior no es accesible sin autenticación. Las cookies en HTTPS incluyen Secure, HttpOnly y SameSite=Strict. Hay límites de peticiones para autenticación y consultas de IA.

Métodos de acceso: correo y contraseña, Google y GitHub. Los proveedores usan autorización por código con PKCE, estado aleatorio, cookies HttpOnly de corta duración y flujos de un solo uso en MySQL. El callback obtiene un correo verificado desde el proveedor. Los tokens del proveedor no se conservan. Vincular métodos requiere iniciar sesión en la cuenta original y usar Configuración; no se fusionan cuentas automáticamente por coincidir el correo. Las tablas `oauth_identities` y `oauth_flows` mantienen las identidades y los flujos temporales. Las fechas de almacenamiento y vencimiento usan UTC.


La conversación usa `/api/chat`, conserva los últimos mensajes como contexto y transmite el texto mediante eventos SSE; el historial de recomendaciones se guarda en MySQL. El contexto se obtiene exclusivamente con el usuario autenticado de la petición e incluye sus cursos, actividades y sesiones. Un `userId` en el cuerpo no selecciona otra cuenta. El cliente envía `X-Orbita-Account` como comprobación adicional; si la cookie identifica otra cuenta, se rechaza la operación y se recarga el estado. Cambiar de cuenta limpia la conversación, los borradores y el temporizador de la anterior.

La IA puede preparar propuestas para crear cursos, actividades y sesiones mediante herramientas controladas por el servidor. No ejecuta SQL ni guarda cambios directamente. El usuario revisa los datos y pulsa «Guardar en mi agenda». Las propuestas se guardan en `chat_actions`, asociadas al usuario, vencen en 15 minutos y solo se confirman desde esa cuenta. Al confirmar, se vuelven a validar referencias, fechas y cruces sobre el estado actual; se guardan en una transacción y se devuelve un recibo. La confirmación es idempotente. El texto «guardado» de la interfaz aparece después del recibo y la agenda se actualiza con el estado leído del servidor. La IA no puede borrar ni editar registros mediante estas herramientas. Las actividades propuestas parten de importancia y dificultad medias, visibles antes de confirmar.

Las respuestas son breves por defecto. Las preguntas de conversación se transmiten de forma progresiva; las propuestas se muestran cuando sus datos han sido validados. El tiempo depende de la conexión y de la cuota del proveedor.


La base ya tiene su esquema inicializado. El Worker no ejecuta migraciones al recibir visitas. Para cambios futuros de esquema, aplicar primero la migración desde una conexión administrativa segura.

