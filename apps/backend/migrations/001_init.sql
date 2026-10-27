CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categorias (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL,
  orden   INTEGER NOT NULL DEFAULT 0,
  activa  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE platillos (
  id           SERIAL PRIMARY KEY,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT '',
  precio       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  imagen_key   TEXT,
  activo       BOOLEAN NOT NULL DEFAULT false,
  agotado      BOOLEAN NOT NULL DEFAULT false,
  orden        INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- un platillo solo puede estar visible si tiene precio
  CONSTRAINT platillo_activo_con_precio CHECK (NOT activo OR precio > 0)
);
CREATE INDEX platillos_categoria_idx ON platillos(categoria_id);

CREATE TABLE ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);

CREATE TABLE pedidos (
  id               SERIAL PRIMARY KEY,
  cliente_nombre   TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL DEFAULT '',
  tipo             TEXT NOT NULL CHECK (tipo IN ('llevar','aqui')),
  notas            TEXT NOT NULL DEFAULT '',
  total            NUMERIC(10,2) NOT NULL,
  estado           TEXT NOT NULL DEFAULT 'nuevo'
                   CHECK (estado IN ('nuevo','preparando','listo','entregado','cancelado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_estado_idx ON pedidos(estado, created_at DESC);

CREATE TABLE pedido_items (
  id              SERIAL PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  platillo_id     INTEGER REFERENCES platillos(id) ON DELETE SET NULL,
  nombre          TEXT NOT NULL,
  precio_unitario NUMERIC(10,2) NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  nota            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX pedido_items_pedido_idx ON pedido_items(pedido_id);

-- Datos del negocio (ya confirmados por el dueño). Lo demás se llena desde el admin.
INSERT INTO ajustes (clave, valor) VALUES
  ('nombre',     'Ahh Plebes de la Once'),
  ('slogan',     'Andamos al cien mi gente bonita. Hay que pasárnosla bien.'),
  ('telefono',   '686 202 9161'),
  ('whatsapp',   '526862029161'),
  ('direccion',  'Prolongación H. Colegio Militar #1242, Col. Voluntad, Mexicali, B.C.'),
  ('maps',       'https://www.google.com/maps/search/?api=1&query=Prolongaci%C3%B3n%20H%20Colegio%20Militar%201242%20Colonia%20Voluntad%20Mexicali%20Baja%20California'),
  ('facebook',   ''),
  ('tiktok',     ''),
  ('instagram',  ''),
  ('youtube',    'https://www.youtube.com/@michingontb3'),
  ('horario',    ''),
  ('pedidos_activos', 'true');

-- Estructura inicial mínima: categorías y 3 platillos de ejemplo OCULTOS y sin precio.
INSERT INTO categorias (nombre, orden) VALUES
  ('Burgers', 1), ('Burritos', 2), ('Hot Dogs', 3), ('Snacks', 4);

INSERT INTO platillos (categoria_id, nombre, descripcion, precio, activo, orden)
SELECT c.id, v.nombre, 'Platillo de ejemplo: edítalo o bórralo desde el panel.', 0, false, 1
FROM (VALUES ('Burgers','Hamburguesa de ejemplo'),
             ('Burritos','Burrito de ejemplo'),
             ('Hot Dogs','Hot dog de ejemplo')) AS v(cat, nombre)
JOIN categorias c ON c.nombre = v.cat;
