const express = require("express");
const {
  subirImagenUnitaria,
  obtenerImagenesPorTrabajo,
  obtenerImagenesVisitasByOrdIns,
} = require("../../../controllers/negocio_lat/imagenes.controllers");
const router = express.Router();

const { upload } = require("../../../utils/middlewares");

// Rutas

//SUBE IMAGENES
router.post("/upload", upload.single("imagen"), subirImagenUnitaria);

//OBTENER LAS IMAGANES DE UNA INSTALACION
router.get("/download/:tabla/:id", obtenerImagenesPorTrabajo);

//OBTENER LAS IMAGANES DE LAS VISITAS
router.get("/downloadvisitas/:tabla/:ord_ins", obtenerImagenesVisitasByOrdIns);

module.exports = router;
