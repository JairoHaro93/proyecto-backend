// utils/middlewares.js
"use strict";

const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const dotenv = require("dotenv");
dotenv.config();

const { selectUsuarioById } = require("../models/sistema/usuarios.models");
const {
  selectSoporteByOrdIns,
} = require("../models/negocio_lat/soportes.models");

/* =========================
   CONFIG COOKIE JWT (sesión deslizante 1h)
========================= */
const COOKIE_NAME = "token";
const SESSION_TTL_S = parseInt(process.env.SESSION_TTL_S || "3600", 10);

const isProd = process.env.NODE_ENV === "production";

/** Opciones de cookie (ajustables por .env) */
const cookieOpts = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAMESITE || (isProd ? "None" : "Lax"),
  secure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd,
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  maxAge: SESSION_TTL_S * 1000, // 👈 usa el TTL configurable
};

/** Emite/renueva JWT en cookie por 1h desde ahora */
function issueSessionCookie(res, payload) {
  // 👇 firma con el TTL configurable
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: SESSION_TTL_S,
  });

  res.cookie(COOKIE_NAME, token, cookieOpts);

  // 👇 expón el vencimiento para el auto-logout del front
  const expiresAtMs = Date.now() + SESSION_TTL_S * 1000;
  res.setHeader("X-Session-Expires", new Date(expiresAtMs).toISOString());

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

/** Protege rutas: valida JWT en cookie y RENUEVA la cookie (+1h) en cada request válido */
const checkToken = async (req, res, next) => {
  // Cookies-first
  let token = req.cookies?.[COOKIE_NAME];

  // Fallback opcional a Bearer (si aún tienes clientes que lo usen)
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

  // Confirmar usuario vigente
  const usuario = await selectUsuarioById(data.usuario_id);
  if (!usuario) {
    return res.status(401).json({ message: "Usuario no existe" });
  }

  // Exponer usuario a la request
  req.user = usuario;

  // 🔁 Sesión deslizante: re-emitir cookie por +1h
  issueSessionCookie(res, {
    usuario_id: usuario.id,
    usuario_usuario: usuario.usuario,
    usuario_rol: usuario.rol,
    usuario_nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
  });

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
};
