-- Embudo de reseñas: 4-5 estrellas se envían a Google; 1-3 quedan como retroalimentación interna.
CREATE TABLE resenas (
  id           SERIAL PRIMARY KEY,
  calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  destino      TEXT NOT NULL CHECK (destino IN ('google','interno')),
  comentario   TEXT NOT NULL DEFAULT '',
  nombre       TEXT NOT NULL DEFAULT '',
  contacto     TEXT NOT NULL DEFAULT '',
  pedido_id    INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  estado       TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','atendida')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX resenas_destino_idx ON resenas(destino, estado, created_at DESC);
CREATE INDEX resenas_fecha_idx ON resenas(created_at DESC);

INSERT INTO ajustes (clave, valor) VALUES
  ('google_place_id', '')   -- ID de lugar de Google del negocio (lo captura el dueño en Ajustes)
ON CONFLICT (clave) DO NOTHING;
