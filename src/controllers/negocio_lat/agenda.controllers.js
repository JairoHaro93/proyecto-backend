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
const path = require("path");
const fs = require("fs");

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
const subirImagenUnitaria = async (req, res) => {
  const { trabajo_id, campo, tabla, ord_ins } = req.body;

  if (!trabajo_id || !campo || !tabla || !ord_ins) {
    return res.status(400).json({
      message: "Se requiere trabajo_id, campo, tabla y orden_instalacion",
    });
  }

  // Campos válidos por tabla
  const camposPermitidos = {
    neg_t_img_visita: ["img_1", "img_2", "img_3", "img_4"],
    neg_t_img_inst: [
      "fachada",
      "router",
      "ont",
      "potencia",
      "speedtest",
      "cable_1",
      "cable_2",
      "equipo_1",
      "equipo_2",
      "equipo_3",
    ],
  };

  // Validar tabla y campo
  if (!camposPermitidos[tabla] || !camposPermitidos[tabla].includes(campo)) {
    return res
      .status(400)
      .json({ message: `Campo no válido para la tabla ${tabla}` });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No se recibió ninguna imagen" });
  }

  // Subcarpeta por orden_instalacion
  const nombreArchivo = req.file.filename;
  const rutaRelativa = path.join(ord_ins, nombreArchivo); // ej: 001-2025/img_123.jpg
  const rutaAbsoluta = path.join(process.env.rutaDestino, rutaRelativa);

  try {
    // Obtener imagen anterior si existe
    const [rows] = await poolmysql.query(
      `SELECT ${campo} FROM ${tabla} WHERE trabajo_id = ?`,
      [trabajo_id]
    );

    if (rows.length > 0) {
      const anterior = rows[0][campo];
      if (anterior) {
        const rutaVieja = path.join(process.env.rutaDestino, anterior);
        if (fs.existsSync(rutaVieja)) {
          fs.unlinkSync(rutaVieja);
        }
      }

      // UPDATE
      await poolmysql.query(
        `UPDATE ${tabla} SET ${campo} = ?, fecha_actualizacion = NOW() WHERE trabajo_id = ?`,
        [rutaRelativa, trabajo_id]
      );
    } else {
      // INSERT
      const columnas = camposPermitidos[tabla];
      const placeholders = columnas
        .map((c) => (c === campo ? "?" : "NULL"))
        .join(", ");
      await poolmysql.query(
        `INSERT INTO ${tabla} (trabajo_id, ${columnas.join(
          ", "
        )}, fecha_actualizacion) VALUES (?, ${placeholders}, NOW())`,
        [trabajo_id, rutaRelativa]
      );
    }

    const urlPublica = `${process.env.IP}/imagenes/${rutaRelativa.replace(
      /\\/g,
      "/"
    )}`;

    res.status(200).json({
      message: `Imagen ${campo} subida a ${tabla}`,
      trabajo_id,
      campo,
      nombreArchivo,
      ruta_relativa: rutaRelativa,
      url_publica: urlPublica,
      fecha_actualizacion: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error al guardar imagen:", error);
    res.status(500).json({
      message: "Error al registrar imagen",
      error: error.message,
    });
  }
};

const camposPorTabla = {
  neg_t_img_visita: ["img_1", "img_2", "img_3", "img_4"],
  neg_t_img_inst: [
    "fachada",
    "router",
    "ont",
    "potencia",
    "speedtest",
    "cable_1",
    "cable_2",
    "equipo_1",
    "equipo_2",
    "equipo_3",
  ],
};

const obtenerImagenesPorTrabajo = async (req, res) => {
  const { tabla, trabajo_id } = req.params;

  if (!trabajo_id || isNaN(trabajo_id)) {
    return res.status(400).json({ message: "ID de trabajo inválido" });
  }

  const campos = camposPorTabla[tabla];
  if (!campos) {
    return res.status(400).json({ message: `Tabla '${tabla}' no válida` });
  }

  try {
    const [rows] = await poolmysql.query(
      `SELECT ${campos.join(", ")} FROM ${tabla} WHERE trabajo_id = ?`,
      [trabajo_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron imágenes" });
    }

    const baseUrl = `${process.env.IP}/imagenes/`;

    const imagenes = {};
    campos.forEach((campo) => {
      const valor = rows[0][campo];
      if (valor) {
        imagenes[campo] = {
          ruta: valor,
          url: baseUrl + valor.replace(/\\/g, "/"),
        };
      }
    });

    res.status(200).json({
      trabajo_id,
      tabla,
      imagenes,
    });
  } catch (error) {
    console.error("❌ Error al obtener imágenes:", error);
    res
      .status(500)
      .json({ message: "Error al obtener imágenes", error: error.message });
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
  subirImagenUnitaria,
  getAllTrabajosByTec,
  getInfoSolByAgeId,
  getAgendaPendienteByFecha,
  obtenerImagenesPorTrabajo,
};
