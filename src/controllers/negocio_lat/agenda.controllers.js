const {
  selectAgendByFecha,
  selectPreAgenda,
  insertAgendaSop,
  updateHorario,
  selectTrabajosByTec,
  updateSolucion,
  selectInfoSolByAgeId,
  selectAgendaPendByFecha,
  selectAgendaByOrdIns,
  insertAgendaHorario,
  selectAgendaBySopId,
  selectAgendaLiteById,
} = require("../../models/negocio_lat/agenda.models");

const { poolmysql } = require("../../config/db");
const path = require("path");
const fs = require("fs");
const {
  selectNombresByOrdInsBatch,
} = require("../../models/negocio/info_clientes.models");

const {
  updateSoporteEstadoById,
  updateSoporteEstadoByOrdIns,
} = require("../../models/negocio_lat/soportes.models");
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// CONTROLADOR PARA OBTENER LA AGENDA POR FECHA
const getAgendaByFecha = async (req, res, next) => {
  try {
    const { fecha } = req.params;

    if (!ISO_DATE_RE.test(fecha)) {
      return res
        .status(400)
        .json({ message: "Formato de fecha inválido. Usa YYYY-MM-DD." });
    }

    // 1) Base: agenda del día (incluye nombre del técnico desde MySQL)
    const agenda = await selectAgendByFecha(fecha); // siempre array

    if (!Array.isArray(agenda) || agenda.length === 0) {
      return res.status(200).json([]);
    }

    // 2) Lista única de ord_ins numéricos para batch
    const ordInsList = Array.from(
      new Set(
        agenda
          .map((a) => {
            const n = Number(a.ord_ins);
            return Number.isFinite(n) ? n : null;
          })
          .filter((v) => v !== null),
      ),
    );

    // 3) Batch a SQL Server: ord_ins -> nombre_completo del cliente
    let nombresMap = new Map(); // ord_ins -> nombre_completo
    if (ordInsList.length > 0) {
      try {
        const filas = await selectNombresByOrdInsBatch(ordInsList);
        for (const r of filas) {
          // r.orden_instalacion, r.nombre_completo
          nombresMap.set(
            Number(r.orden_instalacion),
            r.nombre_completo || null,
          );
        }
      } catch (err) {
        console.warn("⚠️ Falló SQL Server (nombre cliente):", err.message);
        // degradar con gracia: se devuelve sin clienteNombre
      }
    }

    // 4) Fusión sin alterar orden
    const enriquecida = agenda.map((a) => {
      const key = Number(a.ord_ins);
      return {
        ...a,
        clienteNombre: Number.isFinite(key)
          ? (nombresMap.get(key) ?? null)
          : null,
      };
    });

    return res.status(200).json(enriquecida);
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
const postAgendaHorario = async (req, res, next) => {
  const { ord_ins } = req.body;

  try {
    // Verifica si ya existe agenda para esta orden
    const agendas = await selectAgendaByOrdIns(ord_ins);

    // Si alguno no está resuelto, no se permite crear uno nuevo
    const agendaActiva = agendas.find((a) => a.age_estado === "PENDIENTE");

    if (agendaActiva) {
      return res.status(400).json({
        message: "Ya existe un trabajo activo para esta orden de instalación.",
      });
    }

    const newAgenda = req.body;
    const insertId = await insertAgendaHorario(newAgenda);
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
    const body = req.body; // { age_estado, age_solucion }
    // 1) Actualiza agenda (estado + solución) como ya lo hacías
    const result = await updateSolucion(age_id, body);

    // 2) Lógica que antes hacía el trigger (pero ahora en código)
    //    - Solo si quedó CONCLUIDO
    const lite = await selectAgendaLiteById(age_id);
    if (lite) {
      const estado = String(lite.age_estado || "")
        .trim()
        .toUpperCase();
      const tipo = String(lite.age_tipo || "")
        .trim()
        .toUpperCase();

      if (estado === "CONCLUIDO") {
        // a) VISITA / LOS ⇒ cerrar soporte(s)
        if (tipo === "VISITA" || tipo === "LOS") {
          const idSop = lite.age_id_sop && String(lite.age_id_sop).trim();
          const ordIns = lite.ord_ins && String(lite.ord_ins).trim();

          if (idSop && idSop !== "0") {
            await updateSoporteEstadoById(Number(idSop), "CULMINADO");
          } else if (ordIns && ordIns !== "0") {
            await updateSoporteEstadoByOrdIns(ordIns, "CULMINADO");
          }
        }

        // b) RETIRO / TRASLADO EXTERNO / MIGRACION ⇒ no tocar soportes
        // (se considera resuelto solo en agenda)
      }
    }

    return res.status(201).json({ message: "✅ Solución guardada", result });
  } catch (error) {
    console.error("❌ Error al actualizar solución:", error);
    next(error);
  }
};

// CONTROLADOR PARA CREAR UN CASO EN LA AGENDA
const postAgenda = async (req, res, next) => {
  const { ord_ins } = req.body;

  try {
    // Verificar si ya existe una agenda activa para esta orden de instalación
    const agendas = await selectAgendaByOrdIns(ord_ins);

    const agendaActiva = agendas.find((a) => a.age_estado === "PENDIENTE");
    if (agendaActiva) {
      return res.status(400).json({
        message: "Ya existe un trabajo activo para esta orden de instalación.",
      });
    }

    const insertId = await insertAgendaSop(req.body);
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
    neg_t_visitas: ["img_1", "img_2", "img_3", "img_4"],
    neg_t_los: ["img_1", "img_2", "img_3", "img_4"],
    neg_t_instalaciones: [
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
  const rutaAbsoluta = path.join(process.env.RUTA_DESTINO, rutaRelativa);

  try {
    // Obtener imagen anterior si existe
    const [rows] = await poolmysql.query(
      `SELECT ${campo} FROM ${tabla} WHERE trabajo_id = ?`,
      [trabajo_id],
    );

    if (rows.length > 0) {
      const anterior = rows[0][campo];
      if (anterior) {
        const rutaVieja = path.join(process.env.RUTA_DESTINO, anterior);
        if (fs.existsSync(rutaVieja)) {
          fs.unlinkSync(rutaVieja);
        }
      }

      // UPDATE
      await poolmysql.query(
        `UPDATE ${tabla} SET ${campo} = ?, fecha_actualizacion = NOW() WHERE trabajo_id = ?`,
        [rutaRelativa, trabajo_id],
      );
    } else {
      // INSERT
      const columnas = camposPermitidos[tabla];
      const placeholders = columnas
        .map((c) => (c === campo ? "?" : "NULL"))
        .join(", ");
      await poolmysql.query(
        `INSERT INTO ${tabla} (trabajo_id, ${columnas.join(
          ", ",
        )}, fecha_actualizacion) VALUES (?, ${placeholders}, NOW())`,
        [trabajo_id, rutaRelativa],
      );
    }

    const urlPublica = `${process.env.IP}/imagenes/${rutaRelativa.replace(
      /\\/g,
      "/",
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
  neg_t_visitas: ["img_1", "img_2", "img_3", "img_4"],
  neg_t_los: ["img_1", "img_2", "img_3", "img_4"],
  neg_t_instalaciones: [
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
      [trabajo_id],
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
  postAgendaHorario,
  putAgendaSolucion,
  asignarTecnicoAge,
  getPreAgenda,
  postAgenda,
  subirImagenUnitaria,
  getAllTrabajosByTec,
  getInfoSolByAgeId,
  getAgendaPendienteByFecha,
  obtenerImagenesPorTrabajo,
};
