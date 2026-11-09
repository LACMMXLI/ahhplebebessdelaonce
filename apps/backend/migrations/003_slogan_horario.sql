-- Actualiza el eslogan y el horario oficial solicitado por el dueño
INSERT INTO ajustes (clave, valor) VALUES ('slogan', 'Donde el antojo se vuelve arte')
  ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

INSERT INTO ajustes (clave, valor) VALUES ('horario', '5 PM a 3 AM')
  ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
