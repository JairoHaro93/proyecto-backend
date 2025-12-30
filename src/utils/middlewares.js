// C:\PROYECTO\Backend\src\utils\middlewares.js
"use strict";

const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const dotenv = require("dotenv");
dotenv.config();

const { createToken } = require("./helpers");

const { selectUsuarioById } = require("../models/sistema/usuarios.models");
const { selectByid } = require("../models/sistema/login.models");
const {
  selectSoporteByOrdIns,
} = require("../models/negocio_lat/soportes.models");

/* =========================
   CONFIG COOKIE JWT (sesión deslizante 1h)
========================= */
const COOKIE_NAME = "token";
const SESSION_TTL_S = parseInt(process.env.SESSION_TTL_S || "3600", 10);

const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax",
  secure: false, // en producción, con HTTPS, cámbialo a true
  path: "/",
  maxAge: SESSION_TTL_S * 1000,
};

/**
 * Emite la cookie de sesión:
 *  - Crea un JWT con el usuario completo (incluye sucursal/depto/rol).
 *  - Setea cookie + header X-Session-Expires para el frontend.
 */
function issueSessionCookie(res, usuario) {
  const token = createToken(usuario, SESSION_TTL_S); // segundos

  res.cookie(COOKIE_NAME, token, cookieOpts);
  res.setHeader(
    "X-Session-Expires",
    new Date(Date.now() + SESSION_TTL_S * 1000).toISOString()
  );

  return token;
}

/* =========================
   AUTH / CHECKS
========================= */
const checkUsuarioId = async (req, res, next) => {
  const { usuarioId } = req.params;
  if (isNaN(usuarioId)) {
    return res.status(400).json({ message: "El id del usuario es incorrecto" });
  }
  const usuario = await selectUsuarioById(usuarioId);
  if (!usuario) {
    return res.status(404).json({ message: "El id del usuario no existe" });
  }
  next();
};

const checkSoporteOrdIns = async (req, res, next) => {
  const { id_sop } = req.params;
  if (isNaN(id_sop)) {
    return res
      .status(400)
      .json({ message: "La Ord_Ins del soporte es incorrecto" });
  }
  const soporte = await selectSoporteByOrdIns(id_sop);
  if (!soporte) {
    return res.status(404).json({ message: "El id del soporte no existe" });
  }
  next();
};

const checkSoportesNocId = async (req, res, next) => {
  const { id_noc } = req.params;
  if (isNaN(id_noc)) {
    return res
      .status(400)
      .json({ message: "El noc_id del soporte es incorrecto" });
  }
  const soporte = await selectSoporteByOrdIns(id_noc);
  if (!soporte) {
    return res.status(404).json({ message: "El noc_id del soporte no existe" });
  }
  next();
};

/**
 * Protege rutas:
 *  - Valida JWT en cookie o Authorization: Bearer
 *  - Confirma que el usuario existe en BD
 *  - Carga usuario completo (incluye sucursal/depto/roles) en req.user
 *  - RENUEVA la cookie (sesión deslizante)
 */
const checkToken = async (req, res, next) => {
  let token = req.cookies?.[COOKIE_NAME];

  // Fallback opcional a Bearer (móvil / app)
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ message: "No autenticado" });
  }

  let data;
  try {
    data = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }

  // Confirmar usuario vigente y cargar datos completos (incluyendo sucursal/depto)
  const usuario = await selectByid(data.usuario_id); // 👈 usamos login.models
  if (!usuario) {
    return res.status(401).json({ message: "Usuario no existe" });
  }

  // Exponer usuario completo en la request
  req.user = usuario;

  // 🔁 Sesión deslizante: re-emitir cookie por +1h (incluye sucursal/depto/rol)
  issueSessionCookie(res, usuario);

  next();
};

/* =========================
   MULTER: DESTINOS DINÁMICOS
========================= */
const RUTA_DESTINO_DEFAULT = "uploads/soluciones";
const RUTA_DESTINO_INFRA_DEFAULT = "uploads/infraestructura";

const rutaDestino = process.env.RUTA_DESTINO || RUTA_DESTINO_DEFAULT;
const rutaDestinoInfra =
  process.env.RUTA_DESTINO_INFRAESTRUCTURA || RUTA_DESTINO_INFRA_DEFAULT;

// Asegura que existan las carpetas base
[rutaDestino, rutaDestinoInfra].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isInfra =
      req.body?.tabla === "neg_t_infraestructura" ||
      (typeof req.path === "string" && req.path.includes("/infra"));

    const baseDir = isInfra ? rutaDestinoInfra : rutaDestino;

    const directorio = req.body.directorio || "sin_directorio";
    const destino = path.join(baseDir, directorio);

    if (!fs.existsSync(destino)) {
      fs.mkdirSync(destino, { recursive: true });
    }

    cb(null, destino);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = `img_${Date.now()}_${Math.round(Math.random() * 1e5)}${ext}`;
    cb(null, nombre);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imágenes"), false);
  }
};

const upload = multer({ storage, fileFilter });

function clearLegacyCookies(res) {
  // Borra posibles variantes previas
  res.clearCookie(COOKIE_NAME, { path: "/", sameSite: "None", secure: true });
  res.clearCookie(COOKIE_NAME, { path: "/", sameSite: "Lax", secure: false });
}

module.exports = {
  // checks
  checkUsuarioId,
  checkSoportesNocId,
  checkSoporteOrdIns,
  checkToken,

  // multer
  upload,

  // para login/logout/controllers
  COOKIE_NAME,
  cookieOpts,
  issueSessionCookie,
  clearLegacyCookies,
};
