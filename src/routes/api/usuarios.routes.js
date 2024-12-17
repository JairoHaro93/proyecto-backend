const router = require("express").Router();

const { getAllUsuarios } = require("../../controllers/usuarios.controllers");

//Obtener todos los usuarios
router.get("/", getAllUsuarios);

module.exports = router;
