-- ID de lugar de Google del negocio: las calificaciones de 4 y 5 estrellas se envían a su enlace de reseña.
-- Solo se pone si el campo sigue vacío; no pisa un valor que el dueño haya capturado en Ajustes.
UPDATE ajustes SET valor = 'ChIJ13nmmzl614ARSHfNKBkOcpM' WHERE clave = 'google_place_id' AND valor = '';
