const express = require("express");
const {
  subirImagenUnitaria,
  obtenerImagenesPorTrabajo,
} = require("../../../controllers/negocio_lat/imagenes.controllers");
const router = express.Router();

const { upload } = require("../../../utils/middlewares");

// Rutas

//SUBE IMAGENES
router.post("/upload", upload.single("imagen"), subirImagenUnitaria);

//OBTENER LAS IMAGANES DE UNA INSTALACION
router.get("/download/:tabla/:id", obtenerImagenesPorTrabajo);

module.exports = router;
