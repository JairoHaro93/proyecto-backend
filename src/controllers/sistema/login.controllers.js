const bcrypt = require("bcryptjs");
const { selectByUsuario } = require("../../models/sistema/login.models");
const { createToken } = require("../../utils/helpers");
const { poolmysql } = require("../../config/db");

const login = async (req, res, next) => {
  const { usuario, password } = req.body;
  const result = await selectByUsuario(usuario);

  if (!result) {
    return res
      .status(401)
      .json({ message: "Error en el usuario y/o contraseña" });
  }

  if (result.is_auth !== 1) {
    return res.status(403).json({ message: "Usuario no autorizado" });
  }

  if (result.is_logged === 1) {
    return res
      .status(403)
      .json({ message: "El usuario ya inició sesión previamente" });
  }

  const validacion = await bcrypt.compare(password, result.password);

  if (!validacion) {
    return res
      .status(401)
      .json({ message: "Error en el usuario y/o contraseña" });
  }

  // Marcar como logueado
  await poolmysql.query(
    `
    UPDATE sisusuarios 
    SET is_logged = 1 
    WHERE id = ?
  `,
    [result.id]
  );

  res.json({ message: "Login Correcto", token: createToken(result) });
};

const logout = async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { usuario_id } = body;

    if (!usuario_id) {
      return res.status(400).json({ message: "usuario_id es requerido" });
    }

    await poolmysql.query(
      `
      UPDATE sisusuarios 
      SET is_logged = 0 
      WHERE id = ?
    `,
      [usuario_id]
    );

    res.status(204).end(); // Sin contenido, más apropiado para logout
  } catch (error) {
    console.error("❌ Error al cerrar sesión:", error.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

module.exports = { login, logout };
