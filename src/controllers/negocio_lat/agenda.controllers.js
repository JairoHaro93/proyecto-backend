const {
  selectAgendByFecha,
} = require("../../models/negocio_lat/agenda.models");

//CONTROLADOR PARA OBTENER LA AGENDA POR FECHA
const getAgendaById = async (req, res, next) => {
  try {
    const [result] = await selectAgendByFecha();

    if (!result || result.length === 0) {
      return res.json([]); // Devuelve un array vacío en lugar de 404
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgendaById,
};
