const jwt = require("jsonwebtoken");
const { selectUsuarioById } = require("../models/sistema/usuarios.models");
const {
  selectSoporteByOrdIns,
} = require("../models/negocio_lat/soportes.models");

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

const checkSoporteOrdIns = async (req, res, next) => {
  const { id_sop } = req.params;

  // si el usuarioId es un numero
  if (isNaN(id_sop)) {
    return res
      .status(400)
      .json({ message: "La Ord_Ins del soporte es incorrecto" });
  }
  // si existe en la bbdd
  const soporte = await selectSoporteByOrdIns(id_sop);
  if (!soporte) {
    return res.status(404).json({ message: "El id del soporte no existe" });
  }

  next();
};

const checkSoportesNocId = async (req, res, next) => {
  const { id_noc } = req.params;

  // si el usuarioId es un numero
  if (isNaN(id_noc)) {
    return res
      .status(400)
      .json({ message: "El noc_id del soporte es incorrecto" });
  }
  // si existe en la bbdd
  const soporte = await selectSoporteByOrdIns(id_noc);
  if (!soporte) {
    return res.status(404).json({ message: "El noc_id del soporte no existe" });
  }

  next();
};

const checkToken = async (req, res, next) => {
  //Viene la cabecera Authorization incluida?
  if (!req.headers["authorization"]) {
    return res.status(403).json({ message: "Authorization no incluida" });
  }
  const token = req.headers["authorization"]; // aqui saca el token
  //El token es correcto?
  let data;
  try {
    data = jwt.verify(token, "claveparatoken");
  } catch (error) {
    return res.status(403).json({ message: "Token incorrecto" });
  }
  //El usuario codificado en el token existe?
  const usuario = await selectUsuarioById(data.usuario_id);
  if (!usuario) {
    return res.status(403).json({ message: "El usuario no existe" });
  }

  req.user = usuario;
  next();
};
module.exports = {
  checkUsuarioId,
  checkSoportesNocId,
  checkSoporteOrdIns,
  checkToken,
};
