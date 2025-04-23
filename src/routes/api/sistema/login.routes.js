const { login, logout } = require("../../../controllers/sistema/login.controllers");

const router = require("express").Router();

router.post("/", login);
router.post("/not", logout);

module.exports = router;
