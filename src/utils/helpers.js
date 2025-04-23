const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const createToken = (usuario) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no está definido");
  }

  const data = {
    usuario_id: usuario.id,
    usuario_usuario: usuario.usuario,
    usuario_rol: usuario.rol,
    usuario_nombre: usuario.nombre,
  };

  return jwt.sign(data, process.env.JWT_SECRET, { expiresIn: "1h" });
};

module.exports = { createToken };
