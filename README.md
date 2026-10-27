# Ahh Plebes de la Once — tarjeta digital, menú y pedidos

Tarjeta NFC/QR + menú digital con carrito (el pedido sale por WhatsApp) + panel para que el dueño
administre platillos, pedidos y datos del negocio.

## Piezas (cada una se despliega por separado)

```
apps/
  backend/    API Node.js + Express  →  Postgres + almacenamiento S3
  frontend/   Sitio estático (nginx)  →  tarjeta (/), menú (/menu/), panel (/admin/)
```

| Pieza | Qué es | Si se cae… |
|---|---|---|
| **frontend** | nginx con HTML/CSS/JS (sin build) | Nada funciona de cara al cliente, pero el backend y los datos siguen intactos |
| **backend** | API REST + migraciones automáticas | La tarjeta sigue funcionando con datos de respaldo (llamar, WhatsApp, Maps); el menú muestra "No pudimos cargar" con botones para llamar/escribir |
| **Postgres** | Recurso de base de datos de Coolify | El backend responde 503 en `/api/health` y reintenta solo al volver |
| **Almacenamiento (MinIO)** | S3 propio para las fotos | El menú y los pedidos siguen; solo dejan de verse/subirse fotos |

Los datos viven en Postgres; las fotos en el bucket S3. El frontend no guarda nada del servidor.

## Despliegue en Coolify (una pieza a la vez)

Crea los 4 recursos en el mismo proyecto/entorno de Coolify, en este orden.

### 1. Postgres
*New Resource → Database → PostgreSQL.* Copia la **URL interna** (`postgres://…@<host-interno>:5432/<db>`). Activa backups programados.

### 2. Almacenamiento S3 (MinIO)
*New Resource → Service → MinIO.* Dale dos dominios: uno para la API S3 (ej. `files.tudominio.com`) y otro opcional para la consola.
1. En la consola crea una **Access Key** (no uses el usuario root en el backend).
2. No hace falta crear el bucket: el backend lo crea (`S3_BUCKET`) y lo deja con **lectura pública** de objetos al arrancar. La escritura exige las credenciales.
3. `S3_PUBLIC_URL` es el dominio público del paso 1 (`https://files.tudominio.com`); `S3_ENDPOINT` puede ser la URL **interna** de MinIO.

### 3. Backend
*New Resource → Application → este repositorio.*
- Build Pack: **Dockerfile** · Base Directory: **`/apps/backend`** · Puerto: **3000**
- Healthcheck path: `/api/health`
- Dominio: `https://api.tudominio.com`
- En *Watch Paths* pon `apps/backend/**` para que un cambio del frontend no redespliegue el backend.

Variables (ver `apps/backend/.env.example`):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL interna de Postgres |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | `https://tudominio.com` (el dominio del frontend; varios separados por coma) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Primer usuario del dueño (mín. 10 caracteres). Solo se crea si no hay usuarios; luego cambia la contraseña desde el panel |
| `S3_ENDPOINT` | URL interna de MinIO |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | La Access Key del paso 2 |
| `S3_BUCKET` | `platillos` |
| `S3_PUBLIC_URL` | `https://files.tudominio.com` |

Al arrancar aplica las migraciones (`apps/backend/migrations`) y crea las categorías iniciales. No inventa precios: los 3 platillos de ejemplo quedan **ocultos y sin precio**.

### 4. Frontend
*New Resource → Application → este repositorio.*
- Build Pack: **Dockerfile** · Base Directory: **`/apps/frontend`** · Puerto: **80**
- Healthcheck path: `/healthz`
- Dominio: `https://tudominio.com`
- *Watch Paths:* `apps/frontend/**`

| Variable | Valor |
|---|---|
| `API_URL` | `https://api.tudominio.com` |
| `SITE_URL` | `https://tudominio.com` (para la vista previa al compartir) |

La imagen es la misma en cualquier entorno: `API_URL` se aplica al arrancar el contenedor.

### Primer uso
1. Entra a `https://tudominio.com/admin/` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Ajustes**: confirma teléfono y WhatsApp; agrega Facebook, Instagram, TikTok cuando existan (las redes vacías no se muestran).
3. **Platillos**: edita los de ejemplo o crea los tuyos (precio obligatorio para publicar) y sube la foto.
4. Graba en el NFC y genera el QR con `https://tudominio.com/`.

## Cómo funciona un pedido
1. El cliente arma el carrito en `/menu/` (se guarda en su navegador).
2. Al enviar, el backend **recalcula los precios desde la base de datos** (nunca confía en el cliente), guarda el pedido y devuelve un enlace `wa.me` con el mensaje ya escrito.
3. Se abre WhatsApp hacia el número del negocio. El panel muestra el pedido, avisa con sonido y permite pasarlo a *preparando → listo → entregado* o cancelarlo.

No hay pagos en línea: el cliente paga al recibir.

## Seguridad
- Contraseñas con scrypt; sesiones JWT de 8 h; límite de intentos de login y de pedidos por IP.
- Todo contenido de clientes se muestra con `textContent` (sin `innerHTML`); CSP restrictiva en nginx.
- Las imágenes se re-codifican a WebP en el servidor (descarta metadatos y archivos que no sean imagen).
- El bucket solo permite **leer** objetos al público.

## Desarrollo local
```bash
# Opción A: todo junto con Docker (solo desarrollo)
docker compose -f docker-compose.dev.yml up --build

# Opción B: sin Docker
cd apps/backend && cp .env.example .env && npm ci && npm run dev
cd apps/frontend/public && python3 -m http.server 8080     # config.js apunta a http://localhost:3000
```
Pruebas del backend (necesitan un Postgres vacío; define `TEST_DATABASE_URL`):
```bash
cd apps/backend && TEST_DATABASE_URL=postgres://user:pass@localhost:5432/plebes_test npm test
```
> Las pruebas **borran el esquema `public`** de esa base: usa una base exclusiva para tests.

## Pendiente de tu parte
- Enlace de **Facebook** (y TikTok/Instagram cuando existan) → se agrega desde **Ajustes**.
- **Platillos, precios y fotos** reales → desde **Platillos**.
- Dominio(s) y DNS para frontend, API y archivos.
