// controllers/sistema/login.controllers.js
const bcrypt = require("bcryptjs");
const {
  selectByUsuario,
  selectByid,
} = require("../../models/sistema/login.models");
const { createToken } = require("../../utils/helpers");
const { poolmysql } = require("../../config/db");
const {
  issueSessionCookie,
  clearLegacyCookies,
} = require("../../utils/middlewares");

// =======================================
//  LOGIN WEB (Angular) - Cookie HttpOnly
// =======================================
const login = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;
    const result = await selectByUsuario(usuario);

    if (!result) {
      return res
        .status(401)
        .json({ message: "Error en el usuario y/o contraseña" });
    }

    if (result.is_auth !== 1) {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    if (result.is_logged === 1) {
      return res.status(403).json({
        message: "El usuario ya inició sesión previamente",
      });
    }

    const validacion = await bcrypt.compare(password, result.password);

    if (!validacion) {
      return res
        .status(401)
        .json({ message: "Error en el usuario y/o contraseña" });
    }

    // Marcar como logueado (web)
    await poolmysql.query(`UPDATE sisusuarios SET is_logged = 1 WHERE id = ?`, [
      result.id,
    ]);

    // Limpia posibles cookies antiguas con otros atributos
    clearLegacyCookies(res);

    // ✅ Emitir cookie + X-Session-Expires con usuario completo (incluye sucursal/depto/rol)
    issueSessionCookie(res, result);

    res.json({ message: "Login correcto" });
  } catch (error) {
    console.error("❌ Error en login:", error);
    next(error);
  }
};

// =======================================
//  LOGIN APP (Flutter) - Token Bearer
// =======================================
const loginapp = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;
    const result = await selectByUsuario(usuario);

    if (!result) {
      return res.status(401).json({
        success: false,
        message: "Error en el usuario y/o contraseña",
      });
    }

    if (result.is_auth_app !== 1) {
      return res.status(403).json({
        success: false,
        message: "Usuario no autorizado",
      });
    }

    if (result.is_logged_app === 1) {
      return res.status(403).json({
        success: false,
        message: "El usuario ya inició sesión previamente",
      });
    }

    const validacion = await bcrypt.compare(password, result.password);

    if (!validacion) {
      return res.status(401).json({
        success: false,
        message: "Error en el usuario y/o contraseña",
      });
    }

    // Marcar como logueado (app)
    await poolmysql.query(
      `UPDATE sisusuarios SET is_logged_app = 1 WHERE id = ?`,
      [result.id],
    );

    return res.json({
      success: true,
      message: "Login correcto",
      // 👇 Token con sucursal/departamento/rol para la app
      token: createToken(result),
    });
  } catch (error) {
    console.error("❌ Error en loginapp:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// =======================================
//  LOGOUT WEB (Angular)
//  (la ruta viene con text/plain por sendBeacon)
// =======================================
const logout = async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { usuario_id } = body || {};

    if (!usuario_id) {
      return res.status(400).json({ message: "usuario_id es requerido" });
    }

    await poolmysql.query(`UPDATE sisusuarios SET is_logged = 0 WHERE id = ?`, [
      usuario_id,
    ]);

    // Limpiar cookies actuales y legadas
    clearLegacyCookies(res);

    res.status(204).end();
  } catch (error) {
    console.error("❌ Error al cerrar sesión (web):", error.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// =======================================
//  LOGOUT APP (Flutter)
// =======================================
const logoutapp = async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { usuario_id } = body || {};

    if (!usuario_id) {
      return res.status(400).json({
        success: false,
        message: "usuario_id es requerido",
      });
    }

    const [result] = await poolmysql.query(
      `UPDATE sisusuarios SET is_logged_app = 0 WHERE id = ?`,
      [usuario_id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    return res.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("❌ Error al cerrar sesión (app):", error.message);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// =======================================
//  /me – Usuario autenticado (para Angular)
//  (ruta protegida con checkToken)
// =======================================
const me = async (req, res, next) => {
  try {
    // Si checkToken ya cargó el usuario completo en req.user,
    // podrías simplemente hacer: return res.json(req.user);
    // Pero mantenemos la consulta por compatibilidad con tu código previo.

    const usuarioId = req.user?.id || req.user?.usuario_id;

    if (!usuarioId) {
      return res
        .status(400)
        .json({ message: "ID de usuario no encontrado en el token" });
    }

    const result = await selectByid(usuarioId);
    if (!result) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error en /me:", error.message);
    next(error);
  }
};

module.exports = {
  login,
  loginapp,
  logout,
  logoutapp,
  me,
};
