import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Envuelve handlers async para que los errores lleguen al middleware de errores.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const campo = first.path.join('.');
    // Los mensajes propios (refine) ya son legibles; los genéricos de zod llevan el nombre del campo.
    throw new HttpError(400, campo && first.code !== 'custom' ? `${campo}: ${first.message}` : first.message);
  }
  return r.data;
}

export const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id inválido');
  return id;
};

export const precio = z.coerce.number().min(0).max(100000).transform((n) => Math.round(n * 100) / 100);
