# Entre Nosotros

Amigo invisible para la familia, disponible en https://martincornelli.github.io/amigoinvisible/.

Web responsive para iPhone, Android y computadora. Permite entrar con Google o correo, crear encuentros de 3 a 50 personas, invitar por WhatsApp, indicar parejas, sortear una única vez y volver a consultar el resultado. El creador puede eliminar un encuentro antes del sorteo.

## Desarrollo

Requiere Node.js 22 o posterior.

```sh
npm ci
npm run dev
npm test
npm run test:rules
npm run build
```

Las pruebas de reglas requieren Java 21 y usan un proyecto ficticio. `npm run dev` conecta al Firebase real salvo que se active expresamente el entorno local. Para probar sin tocar datos reales, iniciar `npx firebase emulators:start --only auth,firestore --project demo-entre-nosotros`, ejecutar `node scripts/seed-emulator.mjs` y arrancar Vite con la variable `VITE_FIREBASE_EMULATORS=1`. Las cuentas de ejemplo y contraseña del script solo existen en ese emulador.

## Publicación gratuita

GitHub Pages publica la carpeta **docs** de la rama **main**. Después de un cambio, ejecutar `npm run build` y subir tanto el código como `docs`. Vite configura `/amigoinvisible/` como ruta base. Las rutas de invitación usan fragmentos (`#join/...`), por lo que funcionan sin reescrituras de servidor.

Firebase Authentication y Cloud Firestore utilizan el proyecto existente `entre-nosotros-e8c82`, en plan Spark. No se utilizan Cloud Functions, servidor propio ni servicios de IA pagos. Se aplican las cuotas gratuitas de Firebase y GitHub Pages: si se agotan, el servicio puede dejar de responder hasta que se renueven; no se habilita facturación automáticamente.

El dominio `martincornelli.github.io` debe estar en Authentication > Settings > Authorized domains. La configuración SDK de `src/firebase-config.json` es pública por diseño: la protección de datos depende de Authentication y `firestore.rules`, no de ocultar ese archivo. Nunca subir cuentas de servicio, claves privadas o archivos de firma Android.

## Datos y privacidad

Antes del sorteo, el organizador puede editar el total o quitar participantes con confirmación. No puede quitarse a sí mismo. Quitar a alguien limpia su pareja y deja libre el cupo; el total se ajusta por separado. No es un bloqueo: esa persona puede volver a ingresar con la invitación si hay lugar.

Usa el mismo esquema y las mismas cuentas que Android. Entrar con la misma cuenta conserva los encuentros compartidos existentes. Los encuentros guardados únicamente en el teléfono no se importan automáticamente.

Las parejas se excluyen en ambos sentidos. Cada participante recibe y entrega exactamente un regalo. El algoritmo busca una asignación válida con aleatoriedad criptográfica; no promete distribución uniforme entre todas las asignaciones posibles.

Las reglas permiten leer únicamente el resultado de la propia cuenta. El dispositivo del organizador calcula todas las asignaciones antes de guardarlas: requiere confiar en el organizador y en el administrador de Firebase. El enlace permite consultar la lista de participantes a quien tenga una sesión iniciada; compartirlo solo con la familia. Los resultados se ocultan al salir de la pestaña, pero una web no impide capturas.

La sesión persiste en el navegador; cerrar sesión en dispositivos compartidos. Requiere Internet. Puede agregarse a la pantalla de inicio, pero no ofrece funcionamiento sin conexión.

## Enlaces de la app Android

`legacy-hosting` mantiene la página de las invitaciones anteriores de Firebase Hosting y ofrece abrirlas en esta web. Para actualizar solo ese puente: `npx firebase deploy --only hosting --project entre-nosotros-e8c82`. No es necesario para publicar cambios habituales de la web en GitHub Pages.

## Verificación

`npm test`: combinaciones, exclusiones, casos imposibles y formato de invitaciones.

`npm run test:rules`: repositorio web contra Firestore emulado, privacidad, concurrencia al ingresar, parejas, eliminación y sorteo con 50 participantes.

Las pruebas de navegador con emuladores no sustituyen comprobar el acceso real con Google y Safari en un iPhone.
