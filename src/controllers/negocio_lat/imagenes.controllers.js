const { poolmysql } = require("../../config/db");
const path = require("path");
const fs = require("fs");

// CONTROLADOR PARA SUBIR IMAGENES DE VISITA
const subirImagenUnitaria = async (req, res) => {
  let campocompara = "ord_ins";

  const { campo, tabla, id, directorio } = req.body;

  if (!campo || !tabla || !id || !directorio) {
    return res.status(400).json({
      message: "Se requiere campo, tabla, id y directorio",
    });
  }

  const camposPermitidos = {
    neg_t_agenda: ["img_1", "img_2", "img_3", "img_4"],
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

  if (!camposPermitidos[tabla] || !camposPermitidos[tabla].includes(campo)) {
    return res
      .status(400)
      .json({ message: `Campo no válido para la tabla ${tabla}` });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No se recibió ninguna imagen" });
  }

  if (tabla === "neg_t_agenda") {
    campocompara = "age_id_sop";
  }

  const nombreArchivo = req.file.filename;
  const rutaRelativa = path.join(directorio, nombreArchivo);
  const rutaAbsoluta = path.join(process.env.rutaDestino, rutaRelativa);

  try {
    const [rows] = await poolmysql.query(
      `SELECT ${campo} FROM ${tabla} WHERE ${campocompara} = ?`,
      [id]
    );

    if (rows.length > 0) {
      const anterior = rows[0][campo];
      if (anterior) {
        const rutaVieja = path.join(process.env.rutaDestino, anterior);
        if (fs.existsSync(rutaVieja)) {
          fs.unlinkSync(rutaVieja);
        }
      }

      await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);
      await poolmysql.query(
        `UPDATE ${tabla} SET ${campo} = ?, fecha_actualizacion = NOW() WHERE ${campocompara} = ?`,
        [rutaRelativa, id]
      );
      await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);
    } else {
      const columnas = camposPermitidos[tabla];
      const placeholders = columnas
        .map((c) => (c === campo ? "?" : "NULL"))
        .join(", ");
      await poolmysql.query(
        `INSERT INTO ${tabla} (${campocompara}, ${columnas.join(
          ", "
        )}, fecha_actualizacion) VALUES (?, ${placeholders}, NOW())`,
        [id, rutaRelativa]
      );
    }

    const urlPublica = `${process.env.IP}/imagenes/${rutaRelativa.replace(
      /\\/g,
      "/"
    )}`;

    res.status(200).json({
      message: `Imagen ${campo} subida a ${tabla}`,
      id,
      campo,
      nombreArchivo,
      ruta_relativa: rutaRelativa,
      url_publica: urlPublica,
      fecha_actualizacion: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error al guardar imagen:", error);
    res
      .status(500)
      .json({ message: "Error al registrar imagen", error: error.message });
  }
};

const obtenerImagenesPorTrabajo = async (req, res) => {
  let campocompara = "ord_ins";
  const camposPorTabla = {
    neg_t_agenda: ["img_1", "img_2", "img_3", "img_4"],
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

  const { id, tabla } = req.params;

  if (!id || isNaN(id)) {
    return res.status(400).json({ message: "ID de trabajo inválido" });
  }

  const campos = camposPorTabla[tabla];
  if (!campos) {
    return res.status(400).json({ message: `Tabla '${tabla}' no válida` });
  }

  if (tabla === "neg_t_agenda") {
    campocompara = "age_id_sop";
  }
  try {
    const [rows] = await poolmysql.query(
      `SELECT ${campos.join(", ")} FROM ${tabla} WHERE ${campocompara} = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron imágenes" });
    }

    const baseUrl = `${process.env.IP_BACKEND}/imagenes/`;

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
      id,
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

module.exports = {
  subirImagenUnitaria,
  obtenerImagenesPorTrabajo,
};
