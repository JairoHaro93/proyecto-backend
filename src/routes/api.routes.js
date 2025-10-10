const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

//SISTEMA

router.use("/usuarios", require("./api/sistema/usuarios.routes"));
router.use("/login", require("./api/sistema/login.routes"));
router.use("/funciones", checkToken, require("./api/sistema/funciones.routes"));

//NEGOCIO ATUNTAQUI
router.use("/clientes", checkToken, require("./api/negocio/clientes.router"));

//NEGOCIO LATACUNGA
router.use(
  "/soportes",
  checkToken,
  require("./api/negocio_lat/soportes.router")
);
router.use("/vis", checkToken, require("./api/negocio_lat/vis.router"));
router.use(
  "/instalaciones",
  checkToken,
  require("./api/negocio_lat/instalaciones.router")
);

router.use("/agenda", checkToken, require("./api/negocio_lat/agenda.router"));
router.use(
  "/infraestructura",
  require("./api/negocio_lat/infraestructura.router")
);
router.use("/images", require("./api/negocio_lat/images.router"));
module.exports = router;
