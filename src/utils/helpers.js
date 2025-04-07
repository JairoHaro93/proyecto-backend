const jwt = require("jsonwebtoken");
const createToken = (usuario) => {
  const data = {
    usuario_id: `${usuario.id}` ,
    usuario_usuario: usuario.usuario,
    usuario_rol: usuario.rol,
    usuario_nombre: usuario.nombre,
  };
  return jwt.sign(data, "clavetoken");
  // return jwt.sign(data, "clavetoken", { expiresIn: "5 minutes" });
};

module.exports = { createToken };
