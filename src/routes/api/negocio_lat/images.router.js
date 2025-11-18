// routes/negocio_lat/images_router.js
"use strict";
const router = require("express").Router();
const { uploadSingleImage } = require("../../../utils/multer");
const {
  uploadImage,
  listImages,
  listVisitasWithImagesByOrdIns, // (la puedes dejar por compatibilidad)
  listImagesByOrdIns, // ✅ NUEVA
  deleteImageSlot, // ✅ NUEVA
} = require("../../../controllers/negocio_lat/images.controllers");
const { checkToken } = require("../../../utils/middlewares");

// Subir
router.post("/upload", checkToken, uploadSingleImage, uploadImage);

// Listar por entidad
router.get("/list/:module/:entityId", listImages);
router.get("/download/:module/:entityId", listImages); // alias

// Listar TODO por ord_ins (instalación + visitas)
router.get("/by-ord/:ord_ins", listImagesByOrdIns); // ✅ NUEVA

// Borrar un slot (module+entity_id+tag+position)
router.delete("/slot", checkToken, deleteImageSlot); // ✅ NUEVA

// (Opcional) legacy visitas por ord_ins
router.get("/visitas/by-ord/:ord_ins", listVisitasWithImagesByOrdIns);

module.exports = router;
