const {
  insertHuella,
  selectHuellaByLectorFinger,
  selectHuellasCountByUsuarioLector,
  selectHuellaByUsuarioLectorSlot,
  deleteHuellasByUsuarioLector,
  selectHuellasActivasByLector,
  selectHuellasByUsuarioLector,
} = require("../../models/negocio_lat/huellas.molels");
const { poolmysql } = require("../../config/db");
const { setProduccion } = require("../../models/negocio_lat/timbres.models");

const {
  solicitarEliminacionHuellasEnTimbre, // 👈 nuevo
} = require("../../sockets/socketHandler");

// POST /api/huellas/enrolar
// Body esperado (desde ESP32):
// {
//   "lector_codigo": "COT-M-01",
//   "finger_id": 5,
//   "usuario_id": 1,
//   "slot": 1 | 2,
//   "origen": "esp32_enrolamiento"
// }
const postHuellasEnrolar = async (req, res, next) => {
  try {
    let { lector_codigo, finger_id, usuario_id, slot } = req.body;

    if (!lector_codigo || !finger_id || !usuario_id) {
      return res.status(400).json({
        ok: false,
        message: "Campos obligatorios: lector_codigo, finger_id, usuario_id",
      });
    }

    // Normalizar slot
    slot = Number(slot);
    if (!slot || (slot !== 1 && slot !== 2)) {
      return res.status(400).json({
        ok: false,
        message: "El campo 'slot' debe ser 1 o 2",
      });
    }

    // Validar usuario
    const [users] = await poolmysql.query(
      "SELECT id, nombre, apellido FROM sisusuarios WHERE id = ? LIMIT 1",
      [usuario_id]
    );
    if (!users || users.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no existe",
      });
    }
    const user = users[0];

    // Validar timbre
    const [timbres] = await poolmysql.query(
      "SELECT id, lector_codigo FROM neg_t_timbres WHERE lector_codigo = ? LIMIT 1",
      [lector_codigo]
    );
    if (!timbres || timbres.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Timbre no registrado",
      });
    }

    // Cuántas huellas activas tiene ya este usuario en ese timbre
    const [rowsCountAntes] = await selectHuellasCountByUsuarioLector(
      usuario_id,
      lector_codigo
    );
    const totalAntes = rowsCountAntes[0]?.total || 0;

    // Si ya tiene 2, no aceptamos más (regla de negocio)
    if (totalAntes >= 2) {
      return res.status(409).json({
        ok: false,
        message: "Este usuario ya tiene 2 huellas activas para este timbre",
      });
    }

    // Ver si ya hay huella para ese usuario+lector+slot
    const [rowsSlot] = await selectHuellaByUsuarioLectorSlot(
      usuario_id,
      lector_codigo,
      slot
    );
    if (rowsSlot && rowsSlot.length > 0) {
      // 👉 Si **ya existe** para ese slot, lo tratamos como idempotente
      // (por ejemplo, reintento desde el timbre) y devolvemos OK sin error.
      // Además, si con esto ya tiene >= 1 huella, podemos devolver el timbre a PRODUCCION.
      const [rowsCountDespues] = await selectHuellasCountByUsuarioLector(
        usuario_id,
        lector_codigo
      );
      const totalDespues = rowsCountDespues[0]?.total || 0;

      if (totalDespues >= 1) {
        await setProduccion(lector_codigo);
      }

      return res.status(200).json({
        ok: true,
        message:
          "Huella ya estaba registrada para este usuario/timbre/slot. Se mantiene estado.",
        lector_codigo,
        usuario_id,
        usuario_nombre: `${user.nombre} ${user.apellido}`,
        finger_id,
        slot,
        total_huellas_usuario_timbre: totalDespues,
        timbreAProduccion: totalDespues >= 2,
      });
    }

    // Ver si ya existe huella para ese timbre + finger_id
    const [existentes] = await selectHuellaByLectorFinger(
      lector_codigo,
      finger_id
    );
    if (existentes && existentes.length > 0) {
      const existente = existentes[0];

      // 👉 CASO QUE TE ESTÁ PASANDO:
      // Mismo lector_codigo + finger_id y mismo usuario,
      // pero es el segundo intento (slot 2) y el sensor reutiliza el ID.
      if (existente.usuario_id === Number(usuario_id)) {
        // Lo tratamos como idempotente: no insertamos nada nuevo,
        // pero podemos devolver el timbre a PRODUCCION si ya tiene al menos 1 huella.
        const [rowsCountDespues] = await selectHuellasCountByUsuarioLector(
          usuario_id,
          lector_codigo
        );
        const totalDespues = rowsCountDespues[0]?.total || 0;

        if (totalDespues >= 1) {
          await setProduccion(lector_codigo);
        }

        return res.status(200).json({
          ok: true,
          message:
            "Huella ya estaba registrada para este usuario y timbre. Timbre devuelto a PRODUCCION.",
          lector_codigo,
          usuario_id,
          usuario_nombre: `${user.nombre} ${user.apellido}`,
          finger_id,
          slot,
          total_huellas_usuario_timbre: totalDespues,
          timbreAProduccion: totalDespues >= 1,
        });
      }

      // Si es otro usuario → sí es conflicto real
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe una huella registrada para este lector_codigo y finger_id con otro usuario",
      });
    }

    // Insertar huella nueva (slot 1 o 2)
    const [result] = await insertHuella({
      usuario_id,
      lector_codigo,
      finger_id,
      slot,
      estado: "ACTIVA",
    });

    // Recontar
    const [rowsCountDespues] = await selectHuellasCountByUsuarioLector(
      usuario_id,
      lector_codigo
    );
    const totalDespues = rowsCountDespues[0]?.total || 0;

    let timbreAProduccion = false;
    if (totalDespues >= 2) {
      await setProduccion(lector_codigo);
      timbreAProduccion = true;
    }

    return res.status(201).json({
      ok: true,
      message: `Huella enrolada en slot ${slot}${
        timbreAProduccion ? " y timbre devuelto a PRODUCCION" : ""
      }`,
      huella_id: result.insertId,
      lector_codigo,
      usuario_id,
      usuario_nombre: `${user.nombre} ${user.apellido}`,
      finger_id,
      slot,
      total_huellas_usuario_timbre: totalDespues,
      timbreAProduccion,
    });
  } catch (error) {
    console.error("Error en postHuellasEnrolar:", error);
    next(error);
  }
};

// DELETE /api/huellas/:lector_codigo/usuario/:usuario_id
// 1) pide al timbre que borre las huellas
// 2) si OK, borra los registros en BD
const deleteHuellasUsuarioTimbre = async (req, res, next) => {
  try {
    const { lector_codigo, usuario_id } = req.params;

    if (!lector_codigo || !usuario_id) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'lector_codigo' y 'usuario_id' en la URL",
      });
    }

    const usuarioIdNum = Number(usuario_id);

    // 1) Buscar qué huellas tiene este usuario en este timbre
    const [rowsHuellas] = await selectHuellasByUsuarioLector(
      usuarioIdNum,
      lector_codigo
    );

    if (!rowsHuellas || rowsHuellas.length === 0) {
      return res.status(404).json({
        ok: false,
        message:
          "Este usuario no tiene huellas registradas en este timbre (BD)",
        lector_codigo,
        usuario_id: usuarioIdNum,
      });
    }

    // 2) Intentar eliminarlas en el timbre (ESP32)
    try {
      await solicitarEliminacionHuellasEnTimbre(lector_codigo, rowsHuellas);
    } catch (err) {
      console.error(
        "❌ Error al eliminar huellas en timbre antes de borrar en BD:",
        err
      );
      return res.status(502).json({
        ok: false,
        message:
          "No se pudieron eliminar las huellas en el timbre. No se modificó la BD.",
        error: err.message,
      });
    }

    // 3) Si el timbre respondió OK, ahora sí borramos en BD
    const [result] = await deleteHuellasByUsuarioLector(
      usuarioIdNum,
      lector_codigo
    );

    return res.json({
      ok: true,
      message: `Se eliminaron ${result.affectedRows} huellas en la BD para este usuario y timbre`,
      lector_codigo,
      usuario_id: usuarioIdNum,
      eliminadas: result.affectedRows,
    });
  } catch (error) {
    console.error("Error en deleteHuellasUsuarioTimbre:", error);
    next(error);
  }
};

// GET /api/huellas/:lector_codigo
// Devuelve SOLO huellas ACTIVAS de ese timbre con datos del usuario
const getHuellasActivasByLector = async (req, res, next) => {
  try {
    const { lector_codigo } = req.params;

    if (!lector_codigo) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'lector_codigo' en la URL",
      });
    }

    const [rows] = await selectHuellasActivasByLector(lector_codigo);

    // Mapeo de filas a un DTO amigable para Angular
    const huellas = rows.map((row) => ({
      huella_id: row.huella_id ?? row.id,
      usuario_id: row.usuario_id,
      lector_codigo: row.lector_codigo,
      finger_id: row.finger_id,
      slot: row.slot,
      estado: row.estado, // siempre 'ACTIVA' en este endpoint
      usuario_nombre: row.nombre,
      usuario_apellido: row.apellido,
      usuario_usuario: row.usuario,
      usuario_cedula: row.ci,
    }));

    return res.json({
      ok: true,
      lector_codigo,
      total: huellas.length,
      huellas,
    });
  } catch (error) {
    console.error("Error en getHuellasActivasByLector:", error);
    next(error);
  }
};

module.exports = {
  postHuellasEnrolar,
  deleteHuellasUsuarioTimbre,
  getHuellasActivasByLector,
};
