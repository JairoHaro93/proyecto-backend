// utils/multer.js
"use strict";
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ALLOWED_MODULES = new Set([
  "infraestructura",
  "instalaciones",
  "visitas",
  "ventas",
  "bodega",
]);

const ensureUploadsRoot = () => {
  const root = process.env.RUTA_DESTINO;
  if (!root) {
    throw new Error("RUTA_DESTINO no está configurada en el entorno");
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const root = ensureUploadsRoot();

      // module & entity_id vienen en el body del POST
      const modulo = String(req.body.module || "")
        .toLowerCase()
        .trim();
      const entityId = String(req.body.entity_id || "").trim();

      if (!ALLOWED_MODULES.has(modulo)) {
        return cb(new Error(`Módulo no permitido: ${modulo}`));
      }
      if (!entityId || !/^\d+$/.test(entityId)) {
        return cb(new Error("entity_id inválido (debe ser numérico)"));
      }

      const dest = path.join(root, modulo, entityId);
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    try {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
        ? ext
        : ".jpg";
      const unique =
        Date.now() +
        "_" +
        Math.floor(Math.random() * 100000)
          .toString()
          .padStart(5, "0");
      cb(null, `img_${unique}${safeExt}`);
    } catch (err) {
      cb(err);
    }
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new Error("Tipo de archivo no permitido"));
  cb(null, true);
};

const limits = {
  fileSize: 10 * 1024 * 1024, // 10 MB
};

const upload = multer({ storage, fileFilter, limits });

/**
 * Middleware listo para usar en el router:
 *   POST /api/images/upload  (campo de archivo = "image")
 */
const uploadSingleImage = upload.single("image");

module.exports = {
  uploadSingleImage,
  ALLOWED_MODULES,
};
