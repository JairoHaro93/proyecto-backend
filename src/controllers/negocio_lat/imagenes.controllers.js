const { poolmysql } = require("../../config/db");
const path = require("path");
const fs = require("fs");

// CONTROLADOR PARA SUBIR IMAGENES
const subirImagenUnitaria = async (req, res) => {
  let campocompara = "ord_ins";

  const { campo, tabla, id, directorio } = req.body;
  const archivo = req.file;

  console.log(req.body);

  if (!campo || !tabla || !id || !directorio) {
    return res.status(400).json({
      message: "Se requiere campo, tabla, id y directorio",
    });
  }

  const camposPermitidos = {
    neg_t_vis: ["img_1", "img_2", "img_3", "img_4"],
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

  if (!camposPermitidos[tabla] || !camposPermitidos[tabla].includes(campo)) {
    return res
      .status(400)
      .json({ message: `Campo no válido para la tabla ${tabla}` });
  }

  if (!archivo) {
    return res.status(400).json({ message: "No se recibió ninguna imagen" });
  }

  // Ajuste del campo comparador para agenda
  if (tabla === "neg_t_vis") {
    campocompara = "id";
  }

  const nombreArchivo = archivo.filename;
  const rutaRelativa = path.join(directorio, nombreArchivo);
  const rutaDestino = process.env.RUTA_DESTINO;

  if (!rutaDestino) {
    return res.status(500).json({ message: "rutaDestino no está configurado" });
  }

  const rutaAbsoluta = path.join(rutaDestino, rutaRelativa);

  try {
    // ✅ Verificar y crear instalación si no existe
    if (tabla === "neg_t_instalaciones") {
      const [instRows] = await poolmysql.query(
        "SELECT 1 FROM neg_t_instalaciones WHERE ord_ins = ?",
        [id]
      );
      if (instRows.length === 0) {
        await poolmysql.query(
          "INSERT INTO neg_t_instalaciones (ord_ins) VALUES (?)",
          [id]
        );
        console.log(`🛠 Instalación creada para ord_ins: ${id}`);
      }
    }

    // Verificar si ya hay imagen previa
    const [rows] = await poolmysql.query(
      `SELECT ${campo} FROM ${tabla} WHERE ${campocompara} = ?`,
      [id]
    );

    if (rows.length > 0) {
      console.log("SI EXISTE UNA ANTERIOR IMAGEN");
      const anterior = rows[0][campo];
      if (anterior) {
        const rutaVieja = path.join(rutaDestino, anterior);
        if (fs.existsSync(rutaVieja)) {
          fs.unlinkSync(rutaVieja);
        }
      }

      await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);
      await poolmysql.query(
        `UPDATE ${tabla} SET ${campo} = ?, fecha_actualizacion = NOW() WHERE ${campocompara} = ?`,
        [rutaRelativa, id]
      );
      console.log(
        `UPDATE ${tabla} SET ${campo} = ?, fecha_actualizacion = NOW() WHERE ${campocompara} = ?`
      );
      await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);
    } else {
      console.log("NO EXISTE UNA IMAGEN ANTERIOR");
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

// CONTROLADOR PARA OBTENER IMAGENES
const obtenerImagenesPorTrabajo = async (req, res) => {
  let campocompara = "ord_ins";
  const camposPorTabla = {
    neg_t_vis: ["img_1", "img_2", "img_3", "img_4"],
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

  const { id, tabla } = req.params;

  if (!id || isNaN(id)) {
    return res.status(400).json({ message: "ID de trabajo inválido" });
  }

  const campos = camposPorTabla[tabla];
  if (!campos) {
    return res.status(400).json({ message: `Tabla '${tabla}' no válida` });
  }

  if (tabla === "neg_t_vis") {
    campocompara = "id";
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

// ✅ CONTROLADOR PARA OBTENER TODAS LAS VISITAS CON IMÁGENES POR ORD_INS
const obtenerImagenesVisitasByOrdIns = async (req, res) => {
  const { ord_ins, tabla } = req.params;

  if (!ord_ins || isNaN(ord_ins)) {
    return res.status(400).json({ message: "ord_ins inválido" });
  }

  const camposPorTabla = {
    neg_t_vis: [
      "id",
      "vis_tipo",
      "vis_estado",
      "vis_diagnostico",
      "vis_coment_cliente",
      "vis_solucion",
      "fecha_actualizacion",
      "img_1",
      "img_2",
      "img_3",
      "img_4",
    ],
  };

  const campos = camposPorTabla[tabla];
  if (!campos) {
    return res.status(400).json({ message: `Tabla '${tabla}' no válida` });
  }

  try {
    const [rows] = await poolmysql.query(
      `SELECT ${campos.join(
        ", "
      )} FROM ${tabla} WHERE ord_ins = ? ORDER BY id DESC`,
      [ord_ins]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No se encontraron visitas con imágenes" });
    }

    const baseUrl = `${process.env.IP_BACKEND}/imagenes/`;

    const visitasConImagenes = rows.map((row) => {
      const imagenes = {};
      ["img_1", "img_2", "img_3", "img_4"].forEach((campo) => {
        const valor = row[campo];
        if (valor) {
          imagenes[campo] = {
            ruta: valor,
            url: baseUrl + valor.replace(/\\/g, "/"),
          };
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

    res.status(200).json(visitasConImagenes);
  } catch (error) {
    console.error("❌ Error al obtener imágenes de visitas:", error);
    res.status(500).json({
      message: "Error al obtener imágenes",
      error: error.message,
    });
  }
};

module.exports = {
  subirImagenUnitaria,
  obtenerImagenesPorTrabajo,
  obtenerImagenesVisitasByOrdIns,
};
