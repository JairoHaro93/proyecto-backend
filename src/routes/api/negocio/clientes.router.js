const {
  getAllDataClientes,
  getAllDataMapa,
  getServicioByOrdIns,
} = require("../../../controllers/negocio/info_clientes.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();

//OBTENER INFORMACION DE CLIENTES BASICA
router.get("/", checkToken, getAllDataClientes);

//OBTENER INFORMACION DE CLIENTES PARA MAPA
router.get("/mapas", checkToken, getAllDataMapa);

//OBTENER INFORMACION DE SERVICIO POR ORDINS
router.get("/:servicioOrdIns", checkToken, getServicioByOrdIns);

module.exports = router;
