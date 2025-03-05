const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

router.use("/usuarios", checkToken, require("./api/sistema/usuarios.routes"));
router.use("/login", require("./api/sistema/login.routes"));
router.use("/funciones", checkToken, require("./api/sistema/funciones.routes"));
router.use("/clientes", require("./api/negocio/clientes.router"));
router.use("/soportes", require("./api/negocio_lat/soportes.router"));
module.exports = router;
