const { poolmysql } = require("../../config/db");
const bcrypt = require("bcryptjs");
const {
  selectAllUsuarios,
  selectUsuarioById,
  deleteUsuario,
  selectAllAgendaTecnicos,
  selectUsuariosParaTurnos,
  selectCiudadesBySucursal,
  selectDepartamentosControladosPorUsuario,
} = require("../../models/sistema/usuarios.models");

// -------- helpers mínimos --------
function emptyToNull(v) {
  return v === undefined || v === "" ? null : v;
}

function parseDuplicateKey(mysqlError) {
  const msg = String(mysqlError.sqlMessage || mysqlError.message || "");
  let key = null;
  const m1 = msg.match(/for key '.*?\.(.+?)'/);
  const m2 = msg.match(/for key '(.+?)'/);
  if (m1 && m1[1]) key = m1[1];
  else if (m2 && m2[1]) key = m2[1];

  let field = (key || "").replace(/_UNIQUE$/i, "").replace(/^uniq_?/i, "");
  if (!field) field = "registro";

  const val = (msg.match(/Duplicate entry '(.+?)'/) || [])[1];
  return { field, value: val };
}

// -------- handlers --------
const getAllUsuarios = async (req, res, next) => {
  try {
    const [result] = await selectAllUsuarios();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getUsuarioById = async (req, res, next) => {
  const { usuarioId } = req.params;
  try {
    const usuario = await selectUsuarioById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ message: "El ID de usuario no existe." });
    }
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const getAllAgendaTecnicos = async (req, res, next) => {
  try {
    const result = await selectAllAgendaTecnicos();
    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "No hay técnicos con acceso a la agenda" });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const createUsuario = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    payload.password = await bcrypt.hash(String(payload.password || ""), 8);

    // Pre-check duplicados
    const [[dups]] = await poolmysql.query(
      `SELECT 
         SUM(ci = ?) AS ci_dup,
         SUM(usuario = ?) AS usuario_dup
       FROM sisusuarios
       WHERE ci = ? OR usuario = ?`,
      [payload.ci, payload.usuario, payload.ci, payload.usuario],
    );

    if (dups.ci_dup) {
      return res.status(409).json({
        message: "La cédula ya está registrada.",
        field: "ci",
        code: "DUPLICATE",
      });
    }

    if (dups.usuario_dup) {
      return res.status(409).json({
        message: "El nombre de usuario ya está en uso.",
        field: "usuario",
        code: "DUPLICATE",
      });
    }

    const conn = await poolmysql.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO sisusuarios (
          nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.nombre ?? null,
          payload.apellido ?? null,
          payload.ci ?? null,
          payload.usuario ?? null,
          payload.password ?? null,
          payload.fecha_nac ?? null,
          payload.fecha_cont ?? null,
          payload.genero ?? null,
        ],
      );

      if (Array.isArray(payload.rol) && payload.rol.length > 0) {
        const roles = payload.rol.map(Number).filter(Number.isInteger);
        if (roles.length > 0) {
          const values = roles.map(() => "(?, ?)").join(", ");
          const params = roles.flatMap((rid) => [result.insertId, rid]);
          await conn.query(
            `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES ${values}`,
            params,
          );
        }
      }

      await conn.commit();
      const usuario = await selectUsuarioById(result.insertId);
      res.json(usuario);
    } catch (err) {
      await conn.rollback();
      if (err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062)) {
        const { field, value } = parseDuplicateKey(err);
        return res.status(409).json({
          message: `Ya existe un usuario con ese ${field}.`,
          field,
          value,
          code: "DUPLICATE",
        });
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

const updateUsuario = async (req, res, next) => {
  const { usuarioId } = req.params;
  const payload = { ...req.body };

  try {
    const current = await selectUsuarioById(usuarioId);
    if (!current) {
      return res.status(404).json({ message: "El ID de usuario no existe." });
    }

    if (
      typeof payload.password === "string" &&
      payload.password.trim() !== ""
    ) {
      payload.password = await bcrypt.hash(payload.password, 8);
    } else {
      payload.password = null;
    }

    const effectiveCi = payload.ci ?? current.ci;
    const effectiveUsuario = payload.usuario ?? current.usuario;

    if (effectiveCi) {
      const [[ciDup]] = await poolmysql.query(
        `SELECT COUNT(*) AS cnt FROM sisusuarios WHERE ci = ? AND id <> ?`,
        [effectiveCi, usuarioId],
      );
      if (ciDup.cnt > 0) {
        return res.status(409).json({
          message: "La cédula ya está registrada en otro usuario.",
          field: "ci",
          code: "DUPLICATE",
        });
      }
    }

    if (effectiveUsuario) {
      const [[usrDup]] = await poolmysql.query(
        `SELECT COUNT(*) AS cnt FROM sisusuarios WHERE usuario = ? AND id <> ?`,
        [effectiveUsuario, usuarioId],
      );
      if (usrDup.cnt > 0) {
        return res.status(409).json({
          message: "El nombre de usuario ya está en uso por otro usuario.",
          field: "usuario",
          code: "DUPLICATE",
        });
      }
    }

    const conn = await poolmysql.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `
        UPDATE sisusuarios SET 
          nombre     = COALESCE(?, nombre),
          apellido   = COALESCE(?, apellido),
          ci         = COALESCE(?, ci),
          usuario    = COALESCE(?, usuario),
          password   = COALESCE(?, password),
          fecha_nac  = COALESCE(?, fecha_nac), 
          fecha_cont = COALESCE(?, fecha_cont), 
          genero     = COALESCE(?, genero)
        WHERE id = ?
        `,
        [
          emptyToNull(payload.nombre),
          emptyToNull(payload.apellido),
          emptyToNull(payload.ci),
          emptyToNull(payload.usuario),
          payload.password,
          emptyToNull(payload.fecha_nac),
          emptyToNull(payload.fecha_cont),
          emptyToNull(payload.genero),
          usuarioId,
        ],
      );

      if (Array.isArray(payload.rol)) {
        await conn.query(
          `DELETE FROM sisusuarios_has_sisfunciones WHERE sisusuarios_id = ?`,
          [usuarioId],
        );

        const roles = payload.rol.map(Number).filter(Number.isInteger);
        if (roles.length > 0) {
          const values = roles.map(() => "(?, ?)").join(", ");
          const params = roles.flatMap((rid) => [usuarioId, rid]);
          await conn.query(
            `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES ${values}`,
            params,
          );
        }
      }

      await conn.commit();

      const usuario = await selectUsuarioById(usuarioId);
      res.json(usuario);
    } catch (err) {
      await conn.rollback();
      if (err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062)) {
        const { field, value } = parseDuplicateKey(err);
        return res.status(409).json({
          message: `Valor duplicado para ${field}.`,
          field,
          value,
          code: "DUPLICATE",
        });
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

const deleteByID = async (req, res, next) => {
  const { usuarioId } = req.params;
  try {
    const usuario = await selectUsuarioById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ message: "El ID de usuario no existe." });
    }
    await deleteUsuario(usuarioId);
    res.json({
      id: usuarioId,
      message: `Usuario ${usuario.nombre} eliminado con éxito.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Devuelve los usuarios que el usuario autenticado puede gestionar en turnos.
 *
 * Reglas:
 *  - Si es jefe de sucursal (tiene sucursal_id y NO departamento_id):
 *      puede gestionar cualquier departamento ACTIVO de su sucursal.
 *
 *  - Si es jefe/responsable de uno o varios departamentos:
 *      puede gestionar únicamente los departamentos donde
 *      sis_departamentos.jefe_usuario_id = req.user.id.
 *
 *  - Si tiene varios departamentos permitidos, el frontend debe enviar
 *      departamento_id.
 *
 *  - Si solo tiene uno, se toma automáticamente.
 */
const getUsuariosParaTurnos = async (req, res, next) => {
  try {
    const jefe = req.user;

    if (!jefe?.id) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { departamento_id } = req.query;
    const departamentoFiltro = departamento_id ? Number(departamento_id) : null;

    const departamentosPermitidos =
      await selectDepartamentosControladosPorUsuario({
        usuarioId: Number(jefe.id),
        sucursalId: Number(jefe.sucursal_id || 0) || null,
        departamentoId: Number(jefe.departamento_id || 0) || null,
      });

    if (!departamentosPermitidos.length) {
      return res.json([]);
    }

    const idsPermitidos = departamentosPermitidos.map((d) => Number(d.id));

    let departamentoFinal = null;

    if (departamentoFiltro) {
      if (!idsPermitidos.includes(departamentoFiltro)) {
        return res.status(403).json({
          message: "No tienes permiso para gestionar ese departamento",
        });
      }
      departamentoFinal = departamentoFiltro;
    } else if (idsPermitidos.length === 1) {
      departamentoFinal = idsPermitidos[0];
    } else {
      return res.status(400).json({
        message: "Debe seleccionar un departamento",
        requiere_departamento: true,
        departamentos: departamentosPermitidos,
      });
    }

    const lista = await selectUsuariosParaTurnos({
      sucursalId: Number(jefe.sucursal_id || 0) || null,
      jefeUsuarioId: Number(jefe.id),
      departamentoFiltro: departamentoFinal,
    });

    return res.json(lista);
  } catch (err) {
    console.error("❌ Error en getUsuariosParaTurnos:", err.message);
    next(err);
  }
};

async function getMisCiudadesCobertura(req, res, next) {
  try {
    const usuarioId = Number(req.user?.id || req.usuario_id || req.usuario?.id);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res
        .status(400)
        .json({ message: "El id del usuario es incorrecto" });
    }

    const u = await selectUsuarioById(usuarioId);
    if (!u) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const sucursalId = Number(u.sucursal_id);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      return res
        .status(400)
        .json({ message: "Sucursal inválida para el usuario" });
    }

    const resp = await selectCiudadesBySucursal(sucursalId);
    const rows = Array.isArray(resp) && Array.isArray(resp[0]) ? resp[0] : resp;

    const ciudades = (rows || [])
      .map((x) => (x?.ciudad ?? x?.CIUDAD ?? x)?.toString()?.trim())
      .filter(Boolean);

    return res.json({ data: ciudades });
  } catch (e) {
    next(e);
  }
}

const getMisDepartamentosControl = async (req, res, next) => {
  try {
    const jefe = req.user;

    if (!jefe?.id) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const departamentos = await selectDepartamentosControladosPorUsuario({
      usuarioId: Number(jefe.id),
      sucursalId: Number(jefe.sucursal_id || 0) || null,
      departamentoId: Number(jefe.departamento_id || 0) || null,
    });

    return res.json(departamentos);
  } catch (err) {
    console.error("❌ Error en getMisDepartamentosControl:", err.message);
    next(err);
  }
};

module.exports = {
  getAllUsuarios,
  getUsuarioById,
  getAllAgendaTecnicos,
  createUsuario,
  updateUsuario,
  deleteByID,
  getUsuariosParaTurnos,
  getMisCiudadesCobertura,
  getMisDepartamentosControl,
};
