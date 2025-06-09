const {
  selectAgendByFecha,
  insertAgenda,
  selectPreAgenda,
  insertAgendaSop,
  updateHorario,
  selectTrabajosByTec,
  updateSolucion,
  selectInfoSolByAgeId,
  selectAgendaPendByFecha,
} = require("../../models/negocio_lat/agenda.models");

const { poolmysql } = require("../../config/db");

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
const getAgendaPendienteByFecha = async (req, res, next) => {
  try {
    const { fecha } = req.params;

    const result = await selectAgendaPendByFecha(fecha);

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

// CONTROLADOR PARA asignar o actualizar el horariio
const putAgendaHorario = async (req, res, next) => {
  const { age_id } = req.params;
  try {
    const newHorario = req.body;
    const insertId = await updateHorario(age_id, newHorario);
    res.status(201).json({ message: "Agenda registrada", id: insertId });
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA asignar o actualizar la Solucion y el estado
const putAgendaSolucion = async (req, res, next) => {
  const { age_id } = req.params;
  try {
    const body = req.body;
    console.log("📥 PUT solución:", { age_id, body });

    const insertId = await updateSolucion(age_id, body);
    res.status(201).json({ message: "✅ Solución guardada", id: insertId });
  } catch (error) {
    console.error("❌ Error al actualizar solución:", error);
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

// CONTROLADOR PARA SUBIR IMAGENES DE VISITA
const subirImagenesVisita = async (req, res) => {
  const { trabajo_id } = req.body;

  if (!trabajo_id) {
    return res.status(400).json({ message: "Se requiere trabajo_id" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No se recibieron imágenes" });
  }

  // Solo usamos hasta 4 imágenes
  const archivos = req.files.slice(0, 4);
  const nombres = archivos.map((f) => f.filename);

  const columnas = ["img_1", "img_2", "img_3", "img_4"];
  const valoresImagenes = columnas.map((_, i) => nombres[i] || null);

  try {
    const [existing] = await poolmysql.query(
      `SELECT id FROM neg_t_img_visita WHERE trabajo_id = ?`,
      [trabajo_id]
    );

    if (existing.length > 0) {
      await poolmysql.query(
        `UPDATE neg_t_img_visita SET img_1 = ?, img_2 = ?, img_3 = ?, img_4 = ? WHERE trabajo_id = ?`,
        [...valoresImagenes, trabajo_id]
      );
    } else {
      await poolmysql.query(
        `INSERT INTO neg_t_img_visita (trabajo_id, img_1, img_2, img_3, img_4) VALUES (?, ?, ?, ?, ?)`,
        [trabajo_id, ...valoresImagenes]
      );
    }

    res.status(200).json({
      message: "Imágenes asociadas correctamente",
      trabajo_id,
      imagenes: nombres,
    });
  } catch (error) {
    console.error("❌ Error al guardar imágenes:", error);
    res
      .status(500)
      .json({ message: "Error al registrar imágenes", error: error.message });
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

// CONTROLADOR PARA OBTENER TODOS LOS TRABAJOS DE TECNICO
const getAllTrabajosByTec = async (req, res, next) => {
  const { id_tec } = req.params;
  try {
    const soporte = await selectTrabajosByTec(id_tec);

    if (!soporte || soporte.length === 0) {
      return res.json([]); // Devuelve un array vacío en lugar de 404
    }

    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER LA SOLUCION DEL TRABAJO AGENDADO
const getInfoSolByAgeId = async (req, res, next) => {
  const { age_id } = req.params;
  try {
    const soporte = await selectInfoSolByAgeId(age_id);

    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgendaByFecha,
  putAgendaHorario,
  postAgenda,
  putAgendaSolucion,
  asignarTecnicoAge,
  getPreAgenda,
  postAgendaSop,
  subirImagenesVisita,
  getAllTrabajosByTec,
  getInfoSolByAgeId,
  getAgendaPendienteByFecha,
};
