const router = require("express").Router();

const {
  createCaja,
  getCajas,
} = require("../../../controllers/negocio_lat/cajas.controllers");
const { checkToken } = require("../../../utils/middlewares");

//OBTIENE TODAS LAS CAJAS PARA MAPEARLEAS
router.get("/", checkToken, getCajas);

//CREA UNA CAJA
router.post("/", checkToken, createCaja);

//ACTUALIZA UNA CAJA

module.exports = router;
