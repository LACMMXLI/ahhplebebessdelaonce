#!/bin/sh
# Se ejecuta al arrancar el contenedor (antes de nginx). Genera la configuración en tiempo de ejecución
# para que la MISMA imagen sirva en cualquier entorno: solo cambian las variables de entorno.
set -eu

: "${API_URL:?Falta API_URL (ej. https://api.tudominio.com)}"
API_URL="${API_URL%/}"
SITE_URL="${SITE_URL:-}"
SITE_URL="${SITE_URL%/}"

case "$API_URL" in http://*|https://*) ;; *) echo "API_URL debe empezar con http:// o https://" >&2; exit 1;; esac
# Evita caracteres que romperían el JS o la cabecera CSP.
case "$API_URL$SITE_URL" in *\"*|*\'*|*\;*|*\\*|*\ *) echo "API_URL/SITE_URL contienen caracteres no permitidos" >&2; exit 1;; esac

# Copia limpia en cada arranque para que el reemplazo sea idempotente.
rm -rf /usr/share/nginx/html/*
cp -a /app-src/. /usr/share/nginx/html/

printf 'window.APP_CONFIG = { apiUrl: "%s" };\n' "$API_URL" > /usr/share/nginx/html/config.js

for f in /usr/share/nginx/html/index.html /usr/share/nginx/html/menu/index.html; do
  sed -i "s|__SITE_URL__|${SITE_URL}|g" "$f"
done
echo "[frontend] API_URL=$API_URL SITE_URL=${SITE_URL:-<vacío>}"
