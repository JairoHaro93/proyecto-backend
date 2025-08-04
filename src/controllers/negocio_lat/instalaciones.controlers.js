const {
  insertInstalacion,
  selectInstalacionesByOrdIns,
} = require("../../models/negocio_lat/instalaciones.models");

const createInstalacion = async (req, res, next) => {
  try {
    const { ord_ins } = req.body;

    // Verifica si ya existe una instalación registrada para esta orden
    const [instalaciones] = await selectInstalacionesByOrdIns(ord_ins);
    if (instalaciones.length > 0) {
      return res.status(400).json({
        message: "Ya existe una instalación registrada para esta orden.",
      });
    }

    const data = {
      ...req.body,
      registrado_por_id: req.usuario_id, // del token
    };

    const [result] = await insertInstalacion(data);

    res.json({
      message: "Instalación creada correctamente.",
      id: result.insertId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInstalacion,
};
