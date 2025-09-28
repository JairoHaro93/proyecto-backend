"use strict";
const router = require("express").Router();

const {
  getInfraestructuraById,
  createInfraestructura,
  getTrabajoInfraByAgendaId,
} = require("../../../controllers/negocio_lat/infraestructura.controllers");

const { checkToken } = require("../../../utils/middlewares");

// DETALLE POR ID
router.get("/:id_infra", checkToken, getInfraestructuraById);

// DETALLE POR IDAgenda
router.get("/agenda/:id_agenda", checkToken, getTrabajoInfraByAgendaId);

// CREAR (infra + agenda)
router.post("/", checkToken, createInfraestructura);

module.exports = router;
