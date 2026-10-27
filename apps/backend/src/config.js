const env = process.env;

const required = (name) => {
  const v = env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
};

const list = (v) => (v || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

export const config = {
  port: Number(env.PORT) || 3000,
  // Saltos de proxy delante de la API (Traefik de Coolify = 1; con Cloudflare delante, 2).
  trustProxy: Number(env.TRUST_PROXY ?? 1),
  // Zona horaria del negocio (para "hoy" en las estadísticas). Mexicali usa la del Pacífico.
  timezone: env.BUSINESS_TZ || 'America/Tijuana',
  databaseUrl: required('DATABASE_URL'),
  // En producción no hay valor por defecto: un secreto débil invalidaría el login.
  jwtSecret: required('JWT_SECRET'),
  jwtTtl: env.JWT_TTL || '8h',
  // Orígenes permitidos para el navegador (el frontend). Separados por coma.
  corsOrigins: list(env.CORS_ORIGINS),
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  s3: {
    endpoint: env.S3_ENDPOINT || '',
    region: env.S3_REGION || 'us-east-1',
    bucket: env.S3_BUCKET || 'platillos',
    accessKey: env.S3_ACCESS_KEY || '',
    secretKey: env.S3_SECRET_KEY || '',
    // URL pública desde la que el navegador lee las imágenes (sin barra final).
    publicUrl: (env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
  },
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}
