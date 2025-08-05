const express = require("express");
const {
  subirImagenUnitaria,
  getImagenesByTableAndId,
  getArrayAllInfoVisitasByTableAndId,
} = require("../../../controllers/negocio_lat/imagenes.controllers");
const router = express.Router();

const { upload } = require("../../../utils/middlewares");

//OBTENER LAS IMAGANES DE UNA INSTALACION
router.get("/download/:tabla/:id", getImagenesByTableAndId);

//OBTENER TODAS LAS VISITAS POR ORD_INS
router.get(
  "/downloadvisitas/:tabla/:ord_ins",
  getArrayAllInfoVisitasByTableAndId
);

//SUBE IMAGENES
router.post("/upload", upload.single("imagen"), subirImagenUnitaria);

module.exports = router;
