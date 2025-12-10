// controllers/negocio_lat/asistencia.controllers.js
const {
  insertAsistencia,
  selectUltimaAsistenciaHoyByUsuario,
} = require("../../models/negocio_lat/asistencia.models");

const {
  getUsuarioByHuella,
} = require("../../models/negocio_lat/huellas.molels");

const {
  updateUsuarioAuthFlag,
  selectUsuarioById, // 👈 importamos también para obtener nombre/apellido
} = require("../../models/sistema/usuarios.models");

const {
  updateTurnoFromAsistencia,
} = require("../../models/negocio_lat/turnos.models");

// CONTROLADOR PARA REGISTRAR UN MARCADO DE ASISTENCIA
const postMarcarAsistencia = async (req, res, next) => {
  try {
    let {
      usuario_id,
      lector_codigo,
      match_ok,
      origen,
      observacion,
      finger_id, // <-- ID de huella que envía el ESP32
    } = req.body;

    if (!lector_codigo) {
      return res.status(400).json({
        ok: false,
        message: "El campo 'lector_codigo' es obligatorio",
      });
    }

    // 1) Resolver usuario_id por huella si no viene
    if (!usuario_id) {
      if (finger_id === undefined || finger_id === null) {
        return res.status(400).json({
          ok: false,
          message:
            "Debe enviar 'usuario_id' o bien 'finger_id' junto con 'lector_codigo'",
        });
      }

      const [rows] = await getUsuarioByHuella(lector_codigo, finger_id);

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          ok: false,
          message: "Huella no registrada para este lector",
        });
      }

      usuario_id = rows[0].usuario_id;
    }

    const ahora = new Date();

    // 2) Consultar última asistencia del usuario EN EL DÍA ACTUAL
    const [rowsUltima] = await selectUltimaAsistenciaHoyByUsuario(usuario_id);

    let tipoFinal = "ENTRADA"; // por defecto, primera marca del día

    if (rowsUltima && rowsUltima.length > 0) {
      const ultima = rowsUltima[0];
      const fechaUltima = new Date(ultima.fecha_hora);

      const diffMs = ahora.getTime() - fechaUltima.getTime();
      const diffMin = diffMs / (1000 * 60);

      // Regla opcional: no permitir doble marca < 30 min (solo hoy)
      if (diffMin < 30) {
        return res.status(409).json({
          ok: false,
          message:
            "Ya registraste asistencia hace menos de 30 minutos. Espera antes de volver a marcar.",
          ultima_marcacion: {
            id: ultima.id,
            tipo_marcado: ultima.tipo_marcado,
            fecha_hora: ultima.fecha_hora,
            lector_codigo: ultima.lector_codigo,
            diffMin: Number(diffMin.toFixed(2)),
          },
        });
      }

      // Alternancia: ENTRADA -> SALIDA, otro caso -> ENTRADA
      if (ultima.tipo_marcado === "ENTRADA") {
        tipoFinal = "SALIDA";
      } else {
        tipoFinal = "ENTRADA";
      }
    }

    // 3) Insertar asistencia
    const data = {
      usuario_id,
      lector_codigo,
      tipo_marcado: tipoFinal,
      match_ok:
        typeof match_ok === "number" || typeof match_ok === "boolean"
          ? Number(match_ok)
          : 1,
      origen: origen || "esp32_timbre",
      observacion: observacion || null,
    };

    const [result] = await insertAsistencia(data);

    // 4) Actualizar is_auth segun ENTRADA/SALIDA
    // ENTRADA  -> is_auth = 1 (dentro)
    // SALIDA   -> is_auth = 0 (fuera)
    const nuevoIsAuth = tipoFinal === "ENTRADA" ? 1 : 0;
    await updateUsuarioAuthFlag(usuario_id, nuevoIsAuth);

    // 5) Actualizar turno diario con esta marcación
    await updateTurnoFromAsistencia(usuario_id, ahora, tipoFinal);

    // 6) Obtener datos del usuario para enviarlos a la ESP32
    let usuario = null;
    try {
      usuario = await selectUsuarioById(usuario_id); // puede ser null
    } catch (e) {
      console.error("Error obteniendo datos de usuario:", e);
      // no hacemos return, la asistencia ya está registrada
    }

    return res.status(201).json({
      ok: true,
      message: "Marcado de asistencia registrado",
      id: result.insertId,
      usuario_id,
      tipo_marcado: tipoFinal,
      is_auth: nuevoIsAuth,
      nombre: usuario ? usuario.nombre : null,
      apellido: usuario ? usuario.apellido : null,
    });
  } catch (error) {
    console.error("Error en postMarcarAsistencia:", error);
    next(error);
  }
};

module.exports = {
  postMarcarAsistencia,
};
