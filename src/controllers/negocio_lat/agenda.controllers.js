const {
  selectAgendByFecha,
  insertAgenda,
} = require("../../models/negocio_lat/agenda.models");

// CONTROLADOR PARA OBTENER LA AGENDA POR FECHA
const getAgendaByFecha = async (req, res, next) => {
  try {
    const { fecha } = req.params;

    const result = await selectAgendByFecha(fecha);

    res.json(result); // Si está vacío, devuelve []
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER LA AGENDA POR FECHA

const postAgenda = async (req, res, next) => {
  try {
    const newAgenda = req.body;
    const insertId = await insertAgenda(newAgenda);
    res.status(201).json({ message: "Agenda registrada", id: insertId });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgendaByFecha,postAgenda,
};
