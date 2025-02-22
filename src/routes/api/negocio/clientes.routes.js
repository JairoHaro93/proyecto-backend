const {
  getAllDataClientes,
  getAllDataMapa,
} = require("../../../controllers/negocio/info_clientes.controllers");

const router = require("express").Router();

router.get("/", getAllDataClientes);
router.get("/mapas", getAllDataMapa);

module.exports = router;
