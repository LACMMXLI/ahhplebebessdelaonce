FROM nginx:1.27-alpine
COPY public /app-src
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY 40-app-config.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
