const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

//router.use("/usuarios",checkToken, require("./api/usuarios.routes"));
router.use("/usuarios", checkToken, require("./api/sistema/usuarios.routes"));
router.use("/login", require("./api/sistema/login.routes"));
router.use("/funciones", require("./api/sistema/funciones.routes"));
router.use("/prueba", require("./api/negocio/prueba.routes"));
module.exports = router;
