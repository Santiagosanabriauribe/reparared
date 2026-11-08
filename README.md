# ReparaRed

Plataforma web de reparación comunitaria («Reparar antes de reemplazar»). Es la versión funcional del prototipo: ahora tiene **servidor, base de datos y cuentas reales**.

- **Backend:** Node.js (≥ 22.13), sin dependencias externas: servidor HTTP propio con API REST.
- **Base de datos:** **SQLite** (módulo `node:sqlite` incluido en Node). Un solo archivo, sin instalar ni configurar un motor aparte.
- **Frontend:** una sola página (HTML + CSS + JavaScript) en `public/index.html`, conectada a la API.

## Qué hace

| Rol | Funciones |
|---|---|
| **Usuario** | Registro e ingreso, publicar solicitudes con fotos, orientación (auto-reparación, reparador o gestor), recibir propuestas, comparar, chatear, agendar, registrar el resultado y calificar, salida responsable si no se puede reparar, reclamaciones, inscripción a jornadas. |
| **Reparador** | Registro, panel con solicitudes que coinciden con sus especialidades, enviar propuestas, agenda, mensajes con usuarios, edición del perfil, cobros y comisión del 8 %. Solo envía propuestas si la administración verificó su identidad. |
| **Administración** | Verificar identidad y protocolo de reparadores, responder reclamaciones, crear y eliminar jornadas y talleres. |
| **Público** | Directorio de reparadores con reseñas reales, tablero de impacto con métricas calculadas en tiempo real, guías, información legal. |

Reglas del negocio que se mantienen: comisión del 8 % solo sobre reparaciones cerradas, solo el peso medido en báscula suma al impacto, el chat oculta teléfonos y correos, y el punto de equilibrio se calcula con valor medio $80.000, costo operativo $500.000.

## Ejecutar en tu computador

```bash
node -v          # debe ser 22.13 o superior
npm start        # http://localhost:3000
```

La primera vez crea `data/reparared.db` **vacía**: no hay reparadores, solicitudes ni jornadas. Solo existe la cuenta de administración (`admin@reparared.demo` / `admin1234`, o la que definas con `ADMIN_EMAIL` y `ADMIN_PASSWORD`).

Para empezar a usarla: (1) los reparadores se registran en «Panel»; (2) la administración los verifica en «Admin»; (3) los usuarios publican solicitudes; (4) la administración crea jornadas. Un reparador sin verificar no puede enviar propuestas.

Si quieres probar con datos de ejemplo: `SEED_DEMO=1 npm start` con una base nueva.

**Cuentas de ejemplo** (solo existen si arrancas una base nueva con `SEED_DEMO=1`; la cuenta de administración existe siempre)

| Rol | Correo | Contraseña |
|---|---|---|
| Usuaria | `demo@reparared.demo` | `demo1234` |
| Reparadora (Marta) | `marta@reparared.demo` | `demo1234` |
| Otros reparadores | `jhon@`, `luzdary@`, `oscar@`, `camila@`, `hernando@`, `diana@`, `wilson@`, `andrea@`, `taller@` + `reparared.demo` | `demo1234` |
| Administración | `admin@reparared.demo` | `admin1234` |

## Desplegar en Render

El repositorio trae `render.yaml` (Blueprint) y `Dockerfile`.

1. Sube la carpeta a un repositorio de GitHub.
2. En Render: **New → Blueprint** y elige el repositorio. Render lee `render.yaml`.
3. Cuando lo pida, escribe `ADMIN_EMAIL` y `ADMIN_PASSWORD` (los de la persona que administrará).
4. Despliega. La app queda en `https://<nombre>.onrender.com`; la salud se revisa en `/api/health`.

**Importante:** SQLite guarda todo en un archivo, y Render solo conserva archivos en un **disco persistente** (`/data`, 1 GB, ya configurado en `render.yaml`). Los discos requieren un plan de pago (**Starter**). En el plan gratuito el sistema de archivos se borra en cada reinicio o despliegue, y se perderían las cuentas y solicitudes. Si solo quieres una demostración puntual, el plan gratuito sirve sabiendo que los datos son temporales.

Un disco persistente además limita el servicio a **una sola instancia** (no escales a varias).

Variables: `DB_PATH=/data/reparared.db`, `SEED_DEMO=0`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. `PORT` lo pone Render.

**Otros sitios (Docker, Railway, Fly.io, VPS):** el archivo de base de datos debe vivir en un volumen persistente.

```bash
docker compose up -d --build
```

Antes de abrirla al público: define `ADMIN_PASSWORD` propia y haz copias periódicas de `reparared.db` (con la app detenida, o `sqlite3 reparared.db ".backup copia.db"`).

## Estructura

```
server.js      API REST y servidor de archivos estáticos
db.js          esquema SQLite y utilidades
seed.js        administrador inicial (y datos de ejemplo solo con SEED_DEMO=1)
seed-data.js   datos de ejemplo opcionales
public/        frontend (index.html)
Dockerfile, render.yaml, docker-compose.yml, .env.example
```

## API (resumen)

Autenticación: cabecera `Authorization: Bearer <token>` (el token lo devuelve `/api/auth/login` o `/api/auth/register`).

| Método y ruta | Descripción |
|---|---|
| `GET /api/bootstrap` | Estado completo para el usuario actual (reparadores, solicitudes, jornadas, métricas…) |
| `POST /api/auth/register` · `/login` · `/logout` | Cuentas y sesión |
| `POST /api/reqs` | Publicar solicitud |
| `POST /api/reqs/:folio/props` | Reparador envía propuesta |
| `POST /api/reqs/:folio/pick` | Usuario elige reparador y agenda |
| `POST /api/reqs/:folio/result` | Registrar resultado y calificación |
| `POST /api/reqs/:folio/disposal` | Salida responsable |
| `POST /api/reqs/:folio/reclamo` | Radicar reclamación |
| `GET/POST /api/chat` | Mensajes (el servidor filtra teléfonos y correos) |
| `POST /api/jornadas/:id/toggle` | Inscribirse o cancelar |
| `PUT /api/me/rep` | Editar perfil de reparador |
| `GET /api/admin` · `POST /api/admin/reps/:id` · `/reclamos/:id` · `/jornadas` | Administración |

## Notas

- La seguridad se mantuvo básica a propósito (contraseñas con hash scrypt y sesiones por token). Antes de abrirlo a usuarios reales conviene agregar HTTPS obligatorio, límites de intentos de ingreso, verificación de correo, almacenamiento de fotos en un servicio de archivos y revisión legal de los textos.
- Las fotos se guardan comprimidas dentro de la base de datos; para mucho tráfico conviene moverlas a un almacenamiento de archivos.
- El chat se actualiza consultando al servidor cada 3 segundos; no usa WebSockets.
