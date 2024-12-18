const router = require("express").Router();

router.use("/usuarios", require("./api/usuarios.routes"));
router.use("/login", require("./api/login.routes"));

module.exports = router;
