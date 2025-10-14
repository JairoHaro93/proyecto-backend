const router = require("express").Router();

const {
  createCaja,
} = require("../../../controllers/negocio_lat/cajas.controllers");
const { checkToken } = require("../../../utils/middlewares");

//OBTIENE UNA CAJA POR ID

//CREA UNA CAJA
router.post("/", checkToken, createCaja);

//ACTUALIZA UNA CAJA

module.exports = router;
