// controllers/imagenes.controller.js
"use strict";
const { poolmysql } = require("../../config/db");
const path = require("path");
const fs = require("fs");

/* =========================
   CONFIG ESTÁNDAR POR TABLA
========================= */
const TABLAS = {
  neg_t_vis: {
    comparador: "id",
    campos: ["img_1", "img_2", "img_3", "img_4"],
    colFecha: "fecha_actualizacion",
    autoCrear: false,
  },
  neg_t_instalaciones: {
    comparador: "ord_ins",
    campos: [
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
    colFecha: "fecha_actualizacion",
    autoCrear: true, // 👈 ya lo hacías
    autoCrearSQL: (id) => [
      "INSERT INTO neg_t_instalaciones (ord_ins) VALUES (?)",
      [id],
    ],
  },
  neg_t_infraestructura: {
    comparador: "id",
    campos: ["img_ref1", "img_ref2"],
    colFecha: "updated_at",
    autoCrear: true, // 👈 mantenemos tu comportamiento actual
    autoCrearSQL: (id) => [
      "INSERT INTO neg_t_infraestructura (id) VALUES (?)",
      [id],
    ],
  },
};

/* =========================
   HELPERS COMUNES
========================= */
const ensureRutaDestino = () => {
  if (!process.env.RUTA_DESTINO) {
    const err = new Error("RUTA_DESTINO no está configurada");
    err.status = 500;
    throw err;
  }
};

const buildPaths = (archivo, directorio, rutaDestino) => {
  const nombreArchivo = archivo.filename;
  const rutaRelativa = path.join(directorio, nombreArchivo);
  const rutaAbsoluta = path.join(rutaDestino, rutaRelativa);
  return { nombreArchivo, rutaRelativa, rutaAbsoluta };
};

const removeIfExists = (ruta) => {
  if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
};

const publicBase = (req) => `${req.protocol}://${req.get("host")}`;
const urlFromRel = (req, rel) =>
  `${publicBase(req)}/imagenes/${String(rel).replace(/\\/g, "/")}`;

/* =========================
   UPLOAD GENÉRICO
========================= */
async function subirImagenGenerico(req, res, tabla, payload) {
  const archivo = req.file;
  const conf = TABLAS[tabla];
  if (!conf) {
    return res.status(400).json({ message: `Tabla '${tabla}' no soportada` });
  }

  const { campo, id, directorio } = payload || {};
  if (!campo || !id || !directorio) {
    return res
      .status(400)
      .json({ message: "Se requiere campo, id y directorio" });
  }
  if (!conf.campos.includes(campo)) {
    return res
      .status(400)
      .json({ message: `Campo no válido para la tabla ${tabla}` });
  }
  if (!archivo) {
    return res.status(400).json({ message: "No se recibió ninguna imagen" });
  }

  const comp = conf.comparador;

  try {
    ensureRutaDestino();
    const { nombreArchivo, rutaRelativa, rutaAbsoluta } = buildPaths(
      archivo,
      directorio,
      process.env.RUTA_DESTINO
    );

    // Auto-creación si aplica
    if (conf.autoCrear && typeof conf.autoCrearSQL === "function") {
      const [sql, params] = conf.autoCrearSQL(id);
      const [rows] = await poolmysql.query(
        `SELECT 1 FROM ${tabla} WHERE ${comp} = ?`,
        [id]
      );
      if (!rows || rows.length === 0) {
        await poolmysql.query(sql, params);
      }
    }

    // ¿Existe fila? ¿Hay imagen previa?
    const [rowsPrev] = await poolmysql.query(
      `SELECT ${campo} FROM ${tabla} WHERE ${comp} = ?`,
      [id]
    );

    // Desactiva safe updates por si acaso
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);

    if (rowsPrev.length > 0) {
      const anterior = rowsPrev[0][campo];
      if (anterior) {
        const rutaVieja = path.join(process.env.RUTA_DESTINO, anterior);
        removeIfExists(rutaVieja);
      }
      await poolmysql.query(
        `UPDATE ${tabla} SET ${campo} = ?, ${conf.colFecha} = NOW() WHERE ${comp} = ?`,
        [rutaRelativa, id]
      );
    } else {
      // Inserta fila con columnas nulas salvo la del campo actual
      const placeholders = conf.campos
        .map((c) => (c === campo ? "?" : "NULL"))
        .join(", ");
      await poolmysql.query(
        `INSERT INTO ${tabla} (${comp}, ${conf.campos.join(", ")}, ${
          conf.colFecha
        }) VALUES (?, ${placeholders}, NOW())`,
        [id, rutaRelativa]
      );
    }

    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    const urlPublica = urlFromRel(req, rutaRelativa);

    return res.status(200).json({
      message: `Imagen ${campo} subida a ${tabla}`,
      id,
      campo,
      nombreArchivo,
      ruta_relativa: rutaRelativa, // compat
      url_publica: urlPublica, // compat
      imagen: { ruta: rutaRelativa, url: urlPublica }, // estándar
      fecha_actualizacion: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error al subir imagen:", error);
    return res
      .status(error.status || 500)
      .json({ message: "Error al registrar imagen", error: error.message });
  }
}

/* =========================
   SUBIR IMAGEN (APIs COMPAT)
========================= */
// Mantengo tus exports originales para no romper rutas:
const subirImagenUnitaria = (req, res) => {
  // Soporta neg_t_vis y neg_t_instalaciones con el mismo contrato actual
  const { tabla } = req.body || {};
  if (!tabla || !TABLAS[tabla]) {
    return res.status(400).json({ message: "Tabla requerida o no soportada" });
  }
  return subirImagenGenerico(req, res, tabla, req.body);
};

const subirImagenInfraestructura = (req, res) => {
  // Igual contrato que ya usas: {campo, id, directorio} y el archivo
  return subirImagenGenerico(req, res, "neg_t_infraestructura", req.body);
};

/* =========================
   OBTENER IMÁGENES (GENÉRICO)
========================= */
const getImagenesByTableAndId = async (req, res) => {
  const { id, tabla } = req.params;
  if (!id || isNaN(id)) {
    return res.status(400).json({ message: "ID de trabajo inválido" });
  }
  const conf = TABLAS[tabla];
  if (!conf) {
    return res.status(400).json({ message: `Tabla '${tabla}' no válida` });
  }

  try {
    const [rows] = await poolmysql.query(
      `SELECT ${conf.campos.join(", ")} FROM ${tabla} WHERE ${
        conf.comparador
      } = ?`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron imágenes" });
    }

    const imagenes = {};
    conf.campos.forEach((campo) => {
      const valor = rows[0][campo];
      if (valor) {
        imagenes[campo] = {
          ruta: valor,
          url: urlFromRel(req, valor),
        };
      }
    });

    return res.status(200).json({
      id,
      tabla,
      imagenes,
    });
  } catch (error) {
    console.error("❌ Error al obtener imágenes:", error);
    return res
      .status(500)
      .json({ message: "Error al obtener imágenes", error: error.message });
  }
};

/* =========================
   VISITAS (ARRAY DETALLADO)
========================= */
const getArrayAllInfoVisitasByTableAndId = async (req, res) => {
  const { ord_ins, tabla } = req.params;

  if (!ord_ins || isNaN(ord_ins)) {
    return res.status(400).json({ message: "ord_ins inválido" });
  }
  if (tabla !== "neg_t_vis") {
    return res
      .status(400)
      .json({ message: `Tabla '${tabla}' no válida para este endpoint` });
  }

  const campos = [
    "id",
    "vis_tipo",
    "vis_estado",
    "vis_diagnostico",
    "vis_coment_cliente",
    "vis_solucion",
    "fecha_actualizacion",
    ...TABLAS.neg_t_vis.campos,
  ];

  try {
    const [rows] = await poolmysql.query(
      `SELECT ${campos.join(
        ", "
      )} FROM ${tabla} WHERE ord_ins = ? ORDER BY id DESC`,
      [ord_ins]
    );
    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No se encontraron visitas con imágenes" });
    }

    const out = rows.map((row) => {
      const imagenes = {};
      TABLAS.neg_t_vis.campos.forEach((campo) => {
        const valor = row[campo];
        if (valor) {
          imagenes[campo] = { ruta: valor, url: urlFromRel(req, valor) };
        }
      });
      return {
        id: row.id,
        vis_tipo: row.vis_tipo,
        vis_estado: row.vis_estado,
        vis_diagnostico: row.vis_diagnostico,
        vis_coment_cliente: row.vis_coment_cliente,
        vis_solucion: row.vis_solucion,
        fecha_actualizacion: row.fecha_actualizacion,
        imagenes,
      };
    });

    return res.status(200).json(out);
  } catch (error) {
    console.error("❌ Error al obtener imágenes de visitas:", error);
    return res
      .status(500)
      .json({ message: "Error al obtener imágenes", error: error.message });
  }
};

module.exports = {
  // Upload (compat)
  subirImagenUnitaria,
  subirImagenInfraestructura,
  // Download
  getImagenesByTableAndId,
  getArrayAllInfoVisitasByTableAndId,
};
