const {
  selectVisByOrdIns,
  insertVis,
  selectVisById,
  updateVisEstadoById,
} = require("../../models/negocio_lat/vis.models");

//CONTROLADOR PARA OBTENER UN VISITA POR ID
const getVisById = async (req, res, next) => {
  const { id_vis } = req.params;
  try {
    const vis = await selectVisById(id_vis);
    if (!vis) {
      return res.status(404).json({ message: "El ID de VIS no existe." });
    }
    res.json(vis);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER UN VISITA POR ID
const getAllVisByOrdIns = async (req, res, next) => {
  const { ord_ins } = req.params;
  try {
    const vis = await selectVisByOrdIns(ord_ins);
    if (!vis) {
      return res.status(404).json({ message: "El ID de VIS no existe." });
    }
    res.json(vis);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA CREAR UNA VISITA
const createVis = async (req, res, next) => {
  try {
    const { ord_ins } = req.body;

    // Verifica si ya existe un soporte para esta orden
    const vis = await selectVisByOrdIns(ord_ins);

    // Si alguno no está resuelto, no se permite crear uno nuevo
    const VisActivo = vis.find((v) => v.vis_estado !== "RESUELTO");
    console.log(VisActivo);
    if (VisActivo) {
      return res.status(400).json({
        message: "Ya existe un VIS activo para esta orden de instalación.",
      });
    }

    // Inserta la nueva Visita
    const [result] = await insertVis(req.body);
    const respuesta = await selectVisById(result.insertId);

    res.json(respuesta);
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA ACTUALIZAR EL ESTADO DE UNA VISITA
const updateVisById = async (req, res, next) => {
  const { id_vis } = req.params;
  const { vis_estado, vis_solucion } = req.body;

  try {
    const vis = await selectVisById(id_vis);
    if (!vis) {
      return res.status(404).json({ message: "El ID de VIS no existe." });
    }

    await updateVisEstadoById(id_vis, vis_estado, vis_solucion);

    res.json({ message: "Estado de VIS actualizado correctamente." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVisById,
  getAllVisByOrdIns,
  createVis,
  updateVisById,
};
