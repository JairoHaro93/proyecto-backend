const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

//router.use("/usuarios",checkToken, require("./api/usuarios.routes"));
router.use("/usuarios", require("./api/usuarios.routes"));
router.use("/login", require("./api/login.routes"));

module.exports = router;
