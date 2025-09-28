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

const checkToken = async (req, res, next) => {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(403)
      .json({ message: "Token no presente en cookies ni en headers" });
  }

  let data;
  try {
    data = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error("❌ Error al verificar el token:", error.message);
    return res.status(403).json({ message: "Token inválido" });
  }

  const usuario = await selectUsuarioById(data.usuario_id);
  if (!usuario) {
    return res.status(403).json({ message: "El usuario no existe" });
  }

  req.user = usuario;
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

// Asegurar que existan las carpetas base
[rutaDestino, rutaDestinoInfra].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Heurística: si la subida es de infraestructura
    // 1) porque el controlador envía tabla = 'neg_t_infraestructura'
    // 2) o porque la ruta contiene '/infra' (útil si separas las rutas de API)
    const isInfra =
      req.body?.tabla === "neg_t_infraestructura" ||
      (typeof req.path === "string" && req.path.includes("/infra"));

    const baseDir = isInfra ? rutaDestinoInfra : rutaDestino;

    // el subdirectorio "directorio" sigue funcionando igual
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

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imágenes"), false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = {
  checkUsuarioId,
  checkSoportesNocId,
  checkSoporteOrdIns,
  checkToken,
  upload,
};
