-- El negocio se llama "Los Plebes de la Once". Solo se actualiza si el dueño no lo había cambiado ya.
UPDATE ajustes SET valor = 'Los Plebes de la Once' WHERE clave = 'nombre' AND valor = 'Ahh Plebes de la Once';
