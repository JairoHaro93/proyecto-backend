// controllers/negocio_lat/infraestructura.controllers.js
"use strict";

const {
  selectInfraById,
  insertInfraYAgenda,
  selectInfraTrabajoByAgendaId,
} = require("../../models/negocio_lat/infraestructura.models"); // ⬅️ usa TU modelo real y los nombres correctos

// GET /infraestructura/:id_infra  (detalle)
const getInfraestructuraById = async (req, res, next) => {
  try {
    const row = await selectInfraById(req.params.id_infra);
    if (!row)
      return res
        .status(404)
        .json({ message: "El ID de infraestructura no existe." });
    return res.json(row); // objeto plano
  } catch (error) {
    next(error);
  }
};

// POST /infraestructura  (crea en infra + agenda)
// *Sin* validación de coordenadas aquí (ya se valida en el front)
const createInfraestructura = async (req, res, next) => {
  try {
    const { nombre, coordenadas, observacion } = req.body || {};
    if (!nombre || !coordenadas || !observacion) {
      return res.status(400).json({
        message: "Faltan campos requeridos: nombre, coordenadas, observacion",
      });
    }

    const { id } = await insertInfraYAgenda({
      nombre,
      coordenadas,
      observacion,
    }); // ⬅️ nombre correcto
    const row = await selectInfraById(id);
    if (!row)
      return res
        .status(500)
        .json({ message: "Creado pero no se pudo leer el registro" });

    return res.status(201).json(row); // objeto plano
  } catch (error) {
    next(error);
  }
};

/**
 * GET /infraestructura/trabajo/agenda/:agenda_id
 * Devuelve el detalle de un trabajo INFRAESTRUCTURA (agenda + infraestructura).
 */
const getTrabajoInfraByAgendaId = async (req, res, next) => {
  const id = Number(req.params.id_agenda);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "ID de agenda inválido" });
  }

  try {
    const row = await selectInfraTrabajoByAgendaId(id); // ⬅️ del mismo modelo
    if (!row) return res.status(404).json({ message: "No encontrado" });
    return res.json(row); // objeto plano
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInfraestructuraById,
  createInfraestructura,
  getTrabajoInfraByAgendaId,
};
