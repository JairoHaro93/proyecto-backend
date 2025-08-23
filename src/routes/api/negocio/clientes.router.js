const {
  getAllDataMapa,
  getServicioByOrdIns,
  getAllDataArray,
  getDataArrayActivos,
  getAllInstPend,
  buscarClientesActivos,
  buscarClientes,
  getClientesByOrdInsBatch,
} = require("../../../controllers/negocio/info_clientes.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();

//OBTENER INFORMACION DE CLIENTES BASICA DE TODOS LOS CLIENTES
router.get("/", checkToken, buscarClientes);

//OBTENER INFORMACION DE CLIENTES BASICA DE LOS CLIENTES ACTIVOS
router.get("/activos", checkToken, buscarClientesActivos);

//OBTENER INFORMACION DE CLIENTES CON ARRAY DE SERVICIOS ORDENADOS POR ESTADO
router.get("/data/:cedula", checkToken, getAllDataArray);

//OBTENER INFORMACION DE CLIENTES CON ARRAY DE SERVICIOS ACTIVOS ORDENADOS POR FECHA
router.get("/data-act/:cedula", checkToken, getDataArrayActivos);

//OBTENER INFORMACION DE CLIENTES PARA MAPA
router.get("/mapas", checkToken, getAllDataMapa);

//OBTENER INFORMACION DE SERVICIO POR ORDINS
router.get("/:servicioOrdIns", checkToken, getServicioByOrdIns);

//OBTENER LA INFORMACION DE TODAS INSTALACIONES NUEVAS POR REALIZARCE
router.get("/inst-pend", checkToken, getAllInstPend);

//OBTENER LA INFORMACION DE TODAS INSTALACIONES NUEVAS POR REALIZARCE
router.post("/multiples", checkToken, getClientesByOrdInsBatch);

module.exports = router;
