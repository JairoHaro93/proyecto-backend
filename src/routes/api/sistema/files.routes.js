// src/routes/api/sistema/files.routes.js
const router = require("express").Router();
const {
  downloadFileById,
  getFileMetaById,
} = require("../../../controllers/sistema/files.controllers");

// ✅ Metadata (opcional, pero útil para UI)
router.get("/:fileId", getFileMetaById);

// ✅ Descarga privada (PDFs, docs, etc.)
router.get("/:fileId/download", downloadFileById);

module.exports = router;
