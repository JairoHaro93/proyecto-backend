const router = require("express").Router();
const {
  createInstalacion,
  getInstalacionByOrdIns,
} = require("../../../controllers/negocio_lat/instalaciones.controlers");
const { checkToken } = require("../../../utils/middlewares");

//CREA UNA INSTALACION
router.get("/:ordIns", checkToken, getInstalacionByOrdIns);

//CREA UNA INSTALACION
router.post("/", checkToken, createInstalacion);

module.exports = router;
