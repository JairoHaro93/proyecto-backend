// controllers/negocio_lat/cajas.controllers.js
const { insertCaja } = require("../../models/negocio_lat/cajas.model");

async function createCaja(req, res) {
  try {
    let { caja_tipo, caja_nombre, caja_estado, caja_hilo, caja_coordenadas } =
      req.body;

    if (!caja_tipo || !caja_nombre) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: caja_tipo o caja_nombre",
      });
    }

    // Normaliza strings
    caja_tipo = String(caja_tipo).trim();
    caja_nombre = String(caja_nombre).trim();
    caja_estado = (caja_estado ?? "DISEÑO").toString().trim();
    caja_hilo = caja_hilo?.toString().trim() || null;
    caja_coordenadas = caja_coordenadas?.toString().trim() || null; // "-0.93,-78.61"

    const [result] = await insertCaja({
      caja_tipo,
      caja_nombre,
      caja_estado,
      caja_hilo,
      caja_coordenadas,
    });

    res.status(201).json({
      success: true,
      message: "Caja creada correctamente",
      data: {
        id: result.insertId,
        caja_tipo,
        caja_nombre,
        caja_estado,
        caja_hilo,
        caja_coordenadas,
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

module.exports = { createCaja };
