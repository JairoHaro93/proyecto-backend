const jwt = require("jsonwebtoken");
const { selectUsuarioById } = require("../models/sistema/usuarios.models");

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

const checkToken = async (req, res, next) => {
  //Viene la cabecera Authorization incluida?
  if (!req.headers["authorization"]) {
    return res.status(403).json({ message: "Authorization no incluida" });
  }
  const token = req.headers["authorization"];
  //El token es correcto?
  let data;
  try {
    data = jwt.verify(token, "clavetoken");
  } catch (error) {
    return res.status(403).json({ message: "Token incorrecto" });
  }

  //El usuario codificado en el token existe?
  const usuario = await selectUsuarioById(data.usuario_id);

  if (!usuario) {
    return res.status(403).json({ message: "El usuario no existe" });
  }

  next();
};
module.exports = { checkUsuarioId, checkToken };
