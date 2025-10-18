// controllers/negocio_lat/cajas.controllers.js
const {
  insertCaja,
  listCajas,
} = require("../../models/negocio_lat/cajas.model");

// Crear caja (actualizado para aceptar ciudad y coordenadas)
async function createCaja(req, res) {
  try {
    const {
      caja_tipo,
      caja_nombre,
      caja_estado,
      caja_hilo,
      caja_coordenadas,
      caja_ciudad,
    } = req.body;

    if (!caja_tipo || !caja_nombre) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: caja_tipo o caja_nombre",
      });
    }

    const [result] = await insertCaja({
      caja_tipo,
      caja_nombre,
      caja_estado,
      caja_hilo,
      caja_coordenadas,
      caja_ciudad,
    });

    res.status(201).json({
      success: true,
      message: "Caja creada correctamente",
      data: {
        id: result.insertId,
        caja_tipo,
        caja_nombre,
        caja_estado: caja_estado || "DISEÑO",
        caja_hilo: caja_hilo ?? null,
        caja_coordenadas: caja_coordenadas ?? null,
        caja_ciudad: caja_ciudad ?? null,
      },
    });
  } catch (error) {
    console.error("Error al crear la caja:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear la caja",
    });
  }
}

// Listar cajas (con filtros y bbox)
async function getCajas(req, res) {
  try {
    const { ciudad, tipo, estado, q, ne, sw, limit, offset } = req.query;

    const [rows] = await listCajas({
      ciudad,
      tipo,
      estado,
      q,
      ne,
      sw,
      limit,
      offset,
    });

    res.json({
      success: true,
      message: "Cajas obtenidas correctamente",
      data: rows,
    });
  } catch (error) {
    console.error("Error al listar cajas:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al listar las cajas",
    });
  }
}

module.exports = {
  createCaja,
  getCajas,
};
