const router = require("express").Router();
const {
  createInstalacion,
} = require("../../../controllers/negocio_lat/instalaciones.controlers");
const { checkToken } = require("../../../utils/middlewares");

//CREA UNA INSTALACION
router.post("/", checkToken, createInstalacion);

module.exports = router;
