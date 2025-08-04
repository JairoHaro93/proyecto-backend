const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

router.use("/usuarios", checkToken, require("./api/sistema/usuarios.routes"));
router.use("/login", require("./api/sistema/login.routes"));
router.use("/funciones", checkToken, require("./api/sistema/funciones.routes"));
router.use("/clientes", checkToken, require("./api/negocio/clientes.router"));
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
router.use("/imagenes", require("./api/sistema/imagenes.routes"));

module.exports = router;
