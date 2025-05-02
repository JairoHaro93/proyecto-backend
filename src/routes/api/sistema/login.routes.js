const express = require("express"); //
const {
  login,
  logout,
} = require("../../../controllers/sistema/login.controllers");

const router = require("express").Router();

// Middleware para recibir texto plano desde sendBeacon
router.use(express.text({ type: "*/*" }));

router.post("/", login);
router.post("/not", logout);

module.exports = router;
