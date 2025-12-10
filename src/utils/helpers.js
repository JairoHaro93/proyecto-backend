// utils/helpers.js
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET no está definido");
}

/**
 * Construye el payload estándar del JWT a partir del usuario completo
 * (incluye sucursal y departamento).
 */
function buildUserJwtPayload(usuario) {
  if (!usuario) {
    throw new Error("Usuario es requerido para crear el token");
  }

  return {
    usuario_id: usuario.id,
    usuario_usuario: usuario.usuario,
    usuario_nombre: usuario.nombre, // o `${usuario.nombre} ${usuario.apellido}` si prefieres

    // En MySQL lo tienes como JSON_ARRAYAGG(F.nombre)
    usuario_rol: usuario.rol ?? [],

    // Sucursal
    sucursal_id: usuario.sucursal_id ?? null,
    sucursal_codigo: usuario.sucursal_codigo ?? null,
    sucursal_nombre: usuario.sucursal_nombre ?? null,

    // Departamento
    departamento_id: usuario.departamento_id ?? null,
    departamento_codigo: usuario.departamento_codigo ?? null,
    departamento_nombre: usuario.departamento_nombre ?? null,
  };
}

/**
 * Crea un JWT.
 * - Si pasas expiresIn: se usa (en segundos o string tipo "1h").
 * - Si NO pasas expiresIn pero tienes process.env.JWT_EXPIRES_IN, se usa ese valor.
 * - Si no hay nada => token sin expiración explícita (no recomendado, pero posible).
 */
function createToken(usuario, expiresIn) {
  const payload = buildUserJwtPayload(usuario);

  const options = {};
  const envExp = process.env.JWT_EXPIRES_IN;

  if (expiresIn) {
    options.expiresIn = expiresIn;
  } else if (envExp) {
    options.expiresIn = envExp;
  }

  return Object.keys(options).length
    ? jwt.sign(payload, JWT_SECRET, options)
    : jwt.sign(payload, JWT_SECRET);
}

module.exports = {
  createToken,
  buildUserJwtPayload,
};
