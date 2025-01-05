const { login } = require("../../../controllers/sistema/login.controllers");

const router = require("express").Router();

router.post("/", login);

module.exports = router;
