const express = require("express");
const {
  subirImagenUnitaria,
  getImagenesByTableAndId,
  getArrayAllInfoVisitasByTableAndId,
  subirImagenInfraestructura,
} = require("../../../controllers/negocio_lat/imagenes.controllers");
const router = express.Router();

const { upload } = require("../../../utils/middlewares");

//OBTENER LAS IMAGENES DE LA INSTALACION SEGUN NOMBRE TABLA Y UN ID
router.get("/download/:tabla/:id", getImagenesByTableAndId);

//OBTENER TODAS LAS VISITAS POR ORD_INS
router.get(
  "/downloadvisitas/:tabla/:ord_ins",
  getArrayAllInfoVisitasByTableAndId
);

//SUBE UNA IMAGEN
router.post("/upload", upload.single("imagen"), subirImagenUnitaria);

//SUBE UNA IMAGEN INFRAESTRUCTURA
router.post("/infra", upload.single("imagen"), subirImagenInfraestructura);

module.exports = router;
