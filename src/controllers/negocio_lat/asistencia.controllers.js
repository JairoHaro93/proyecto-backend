// controllers/negocio_lat/asistencia.controllers.js
const {
  insertAsistencia,
  selectUltimaAsistenciaHoyByUsuario,
  countAsistenciasHoyByUsuario,
  selectAsistenciaById,
} = require("../../models/negocio_lat/asistencia.models");

const {
  getUsuarioByHuella,
} = require("../../models/negocio_lat/huellas.molels");

const {
  updateUsuarioAuthFlag,
  selectUsuarioById,
} = require("../../models/sistema/usuarios.models");

const {
  updateTurnoFromAsistencia,
} = require("../../models/negocio_lat/turnos.models");

const postMarcarAsistencia = async (req, res, next) => {
  try {
    let {
      usuario_id,
      lector_codigo,
      match_ok,
      origen,
      observacion,
      finger_id,
    } = req.body;

    if (!lector_codigo) {
      return res.status(400).json({
        ok: false,
        message: "El campo 'lector_codigo' es obligatorio",
      });
    }

    // 1) Resolver usuario por huella si no viene usuario_id
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

    // 2) Máximo 4 marcas por día
    const [rowsCount] = await countAsistenciasHoyByUsuario(usuario_id);
    const totalHoy = Number(rowsCount?.[0]?.total || 0);
    if (totalHoy >= 4) {
      return res.status(409).json({
        ok: false,
        message: "Ya tienes 4 marcaciones registradas hoy. No se permite más.",
        total_hoy: totalHoy,
      });
    }

    // 3) Bloqueo: no permitir 2 marcas en menos de 30 minutos (comparado con la última de HOY)
    const [rowsUltima] = await selectUltimaAsistenciaHoyByUsuario(usuario_id);
    if (rowsUltima && rowsUltima.length > 0) {
      const ultima = rowsUltima[0];
      const fechaUltima = new Date(ultima.fecha_hora);
      const diffMin = (ahora.getTime() - fechaUltima.getTime()) / (1000 * 60);

      if (diffMin < 30) {
        return res.status(409).json({
          ok: false,
          message:
            "Ya registraste asistencia hace menos de 30 minutos. Espera antes de volver a marcar.",
          ultima_marcacion: {
            id: ultima.id,
            fecha_hora: ultima.fecha_hora,
            lector_codigo: ultima.lector_codigo,
            diffMin: Number(diffMin.toFixed(2)),
          },
        });
      }
    }

    // 4) Insertar evento crudo
    const data = {
      usuario_id,
      lector_codigo,
      match_ok:
        typeof match_ok === "number" || typeof match_ok === "boolean"
          ? Number(match_ok)
          : 1,
      origen: origen || "esp32_timbre",
      observacion: observacion || null,
    };

    const [result] = await insertAsistencia(data);
    const insertId = result.insertId;

    // (Opcional) is_auth...
    const n = totalHoy + 1;
    const nuevoIsAuth = n % 2 === 1 ? 1 : 0;
    await updateUsuarioAuthFlag(usuario_id, nuevoIsAuth);

    // ✅ Reconstruir turno usando la fecha_hora real guardada en MySQL
    try {
      const [[rowInserted]] = await selectAsistenciaById(insertId);
      const fechaMarcacion = rowInserted?.fecha_hora || new Date();
      await updateTurnoFromAsistencia(usuario_id, fechaMarcacion);
    } catch (e) {
      console.error("⚠️ No se pudo reconstruir turno:", e);
    }

    let usuario = null;
    try {
      usuario = await selectUsuarioById(usuario_id);
    } catch (e) {
      console.error("Error obteniendo datos de usuario:", e);
    }

    return res.status(201).json({
      ok: true,
      message: "Marcación registrada",
      id: insertId,
      usuario_id,
      n_marcacion_hoy: n,
      is_auth: nuevoIsAuth,
      nombre: usuario ? usuario.nombre : null,
      apellido: usuario ? usuario.apellido : null,
    });
  } catch (error) {
    console.error("Error en postMarcarAsistencia:", error);
    next(error);
  }
};

module.exports = { postMarcarAsistencia };
