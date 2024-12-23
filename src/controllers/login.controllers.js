const bcrypt = require("bcryptjs");
const { selectByUsuario } = require("../models/login.models");
const { createToken } = require("../utils/helpers");

const login = async (req, res, next) => {
  //Existe el usuairo en la BD?
  const { usuario, password } = req.body;
  const result = await selectByUsuario(usuario);
  if (!result) {
    return res
      .status(401)
      .json({ message: "Error en el usuario y/o contraseña" });
  }
  //Coindicde las password?

  const validacion = await bcrypt.compare(password, result.password);

  if (!validacion) {
    return res
      .status(401)
      .json({ message: "Error en el usuario y/o contraseña" });
  }

  //Login Correcto
  res.json({ message: "Login Correcto" , token: createToken(usuario)});
};

module.exports = { login };
