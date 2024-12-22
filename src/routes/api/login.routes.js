const { login } = require("../../controllers/login.controllers");

const router = require("express").Router();

router.post("/", login);

module.exports = router;
