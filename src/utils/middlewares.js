const { selectUsuarioById } = require("../models/usuarios.models");

const checkUsuarioId = async (req, res, next) => {
  const { usuarioId } = req.params;

  // si el usuarioId es un numero
  if (isNaN(usuarioId)) {
    return res.status(400).json({ message: "El id del usuario es incorrecto" });
  }

  // si existe en la bbdd
  const usuario = await selectUsuarioById(usuarioId);

  if (!usuario) {
    return res.status(404).json({ message: "El id del usuario no existe" });
  }

  next();
};
module.exports = { checkUsuarioId };
