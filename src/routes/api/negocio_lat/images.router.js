// routes/images_router.js
"use strict";
const router = require("express").Router();

const { uploadSingleImage } = require("../../../utils/multer");
const {
  uploadImage,
  listImages,
  listVisitasWithImagesByOrdIns,
} = require("../../../controllers/negocio_lat/images.controllers");

// Middleware de auth (usa el tuyo)
const { checkToken } = require("../../../utils/middlewares");

// Subir imagen (protegido)
router.post("/upload", uploadSingleImage, uploadImage);

// Listar imágenes por módulo/entidad (público por ahora)
router.get("/list/:module/:entityId", listImages);

// Alias de compatibilidad
router.get("/download/:module/:entityId", listImages);

//IMAGENES EN VISITAS
router.get("/visitas/by-ord/:ord_ins", listVisitasWithImagesByOrdIns);

module.exports = router;
