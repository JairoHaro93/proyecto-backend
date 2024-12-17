const router = require("express").Router();

router.use("/usuarios", require("./api/usuarios.routes"));

module.exports = router;
