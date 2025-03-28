const {
  selectAgendByFecha,
  insertAgenda,
  updateAsignarTecnicoAge,
  selectPreAgenda,
  insertAgendaSop,
  updateHorario,
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
const getPreAgenda = async (req, res, next) => {
  try {
    const { fecha } = req.params;

    const result = await selectPreAgenda(fecha);

    res.json(result); // Si está vacío, devuelve []
  } catch (error) {
    next(error);
  }
};





// CONTROLADOR PARA CREAR UN HORARIO

const postAgenda = async (req, res, next) => {
  try {
    const newAgenda = req.body;
    const insertId = await insertAgenda(newAgenda);
    res.status(201).json({ message: "Agenda registrada", id: insertId });
  } catch (error) {
    next(error);
  }
};


// CONTROLADOR PARA CREAR UN HORARIO

const putAgenda = async (req, res, next) => {

  const { age_id } = req.params;


  try {
    const newHorario = req.body;
    const insertId = await updateHorario(age_id,newHorario);
    res.status(201).json({ message: "Agenda registrada", id: insertId });
  } catch (error) {
    next(error);
  }
};





// CONTROLADOR PARA OBTENER LA AGENDA POR FECHA

const postAgendaSop = async (req, res, next) => {

  const { soporteId } = req.params;
  
  try {
    const newAgenda = req.body;
    const insertId = await insertAgendaSop(newAgenda);
    res.status(201).json({ message: "Agenda registrada", id: insertId });
  } catch (error) {
    next(error);
  }
};



//CONTROLADOR PARA QUE NOC ASIGNE UN TECNCIO EN AGENDA
const asignarTecnicoAge = async (req, res, next) => {
  const { soporteId } = req.params;

  try {
    await updateAsignarTecnicoAge(soporteId, req.body);
    const soporte = await selectSoporteById(soporteId);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgendaByFecha,putAgenda,postAgenda,asignarTecnicoAge,getPreAgenda,postAgendaSop
};
