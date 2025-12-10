// src/controllers/sistema/usuarios.controllers.js
const { poolmysql } = require("../../config/db");
const bcrypt = require("bcryptjs");
const {
  selectAllUsuarios,
  selectUsuarioById,
  deleteUsuario,
  selectAllAgendaTecnicos,
  selectUsuariosParaTurnos,
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

    // Pre-check duplicados (rápido y mensaje claro)
    const [[dups]] = await poolmysql.query(
      `SELECT 
         SUM(ci = ?) AS ci_dup,
         SUM(usuario = ?) AS usuario_dup
       FROM sisusuarios
       WHERE ci = ? OR usuario = ?`,
      [payload.ci, payload.usuario, payload.ci, payload.usuario]
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
        ]
      );

      if (Array.isArray(payload.rol) && payload.rol.length > 0) {
        const roles = payload.rol.map(Number).filter(Number.isInteger);
        if (roles.length > 0) {
          const values = roles.map(() => "(?, ?)").join(", ");
          const params = roles.flatMap((rid) => [result.insertId, rid]);
          await conn.query(
            `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES ${values}`,
            params
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

    // Hash solo si vino password no vacío; null => conservar
    if (
      typeof payload.password === "string" &&
      payload.password.trim() !== ""
    ) {
      payload.password = await bcrypt.hash(payload.password, 8);
    } else {
      payload.password = null;
    }

    // Valores efectivos (para validar unicidad)
    const effectiveCi = payload.ci ?? current.ci;
    const effectiveUsuario = payload.usuario ?? current.usuario;

    // Pre-check duplicados excluyendo al propio usuario
    if (effectiveCi) {
      const [[ciDup]] = await poolmysql.query(
        `SELECT COUNT(*) AS cnt FROM sisusuarios WHERE ci = ? AND id <> ?`,
        [effectiveCi, usuarioId]
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
        [effectiveUsuario, usuarioId]
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
          payload.password, // null => conserva
          emptyToNull(payload.fecha_nac),
          emptyToNull(payload.fecha_cont),
          emptyToNull(payload.genero),
          usuarioId,
        ]
      );

      // Sincronía de roles: solo si viene "rol" en el body (aunque sea [])
      if (Array.isArray(payload.rol)) {
        await conn.query(
          `DELETE FROM sisusuarios_has_sisfunciones WHERE sisusuarios_id = ?`,
          [usuarioId]
        );

        const roles = payload.rol.map(Number).filter(Number.isInteger);
        if (roles.length > 0) {
          const values = roles.map(() => "(?, ?)").join(", ");
          const params = roles.flatMap((rid) => [usuarioId, rid]);
          await conn.query(
            `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES ${values}`,
            params
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
 * Devuelve la lista de usuarios que se pueden gestionar en turnos
 * según la sucursal/departamento del usuario logueado.
 *
 * Por ahora:
 *  - Si el usuario tiene sucursal_id => solo esa sucursal
 *  - Si además tiene departamento_id => solo ese departamento
 *  - (Más adelante podemos meter roles tipo ADMIN para ver todo)
 */
// controllers/sistema/usuarios.controllers.js
/**
 * Devuelve la lista de usuarios que se pueden gestionar en turnos
 * según la sucursal/departamento del usuario logueado.
 *
 * Regla:
 *  - Siempre se filtra por sucursal_id del usuario.
 *  - Si el usuario NO tiene departamento_id → se considera JEFE DE SUCURSAL
 *    y ve a TODOS los usuarios de la sucursal (todos los departamentos).
 *  - Si SÍ tiene departamento_id → JEFE DE DEPARTAMENTO, solo ve su departamento.
 *  - Siempre se EXCLUYE al propio usuario (no puede asignarse sus turnos).
 */
/**
 * Devuelve la lista de usuarios que se pueden gestionar en turnos
 * según la sucursal/departamento del usuario logueado.
 *
 * Reglas:
 *  - Si el usuario tiene sucursal_id pero NO tiene departamento_id
 *    => se considera Jefe de Sucursal → ve jefes de departamento.
 *
 *  - Si tiene sucursal_id y departamento_id
 *    => se considera Jefe de Departamento → ve usuarios de su
 *       departamento y sub-departamentos (árbol recursivo).
 */
const getUsuariosParaTurnos = async (req, res, next) => {
  try {
    const jefe = req.user; // ← viene de checkToken

    if (!jefe) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // 🔹 viene desde Angular como query param (opcional)
    const { departamento_id } = req.query;
    const departamentoFiltro = departamento_id
      ? Number(departamento_id)
      : undefined;

    console.log("[TURNOS] jefe backend:", {
      id: jefe.id,
      sucursal_id: jefe.sucursal_id,
      departamento_id: jefe.departamento_id,
      departamentoFiltro,
    });

    const lista = await selectUsuariosParaTurnos({
      sucursalId: jefe.sucursal_id || null,
      departamentoId: jefe.departamento_id || null,
      jefeUsuarioId: jefe.id,
      departamentoFiltro,
    });

    console.log("[TURNOS] usuarios para turnos (backend):", lista.length);

    return res.json(lista);
  } catch (err) {
    console.error("❌ Error en getUsuariosParaTurnos:", err.message);
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
};
