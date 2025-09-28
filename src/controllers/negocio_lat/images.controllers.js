// src/controllers/images_controller.js
"use strict";

const path = require("path");
const fs = require("fs");
const { poolmysql } = require("../../config/db"); // ajusta la ruta si tu estructura difiere

/* =========================
   HELPERS
========================= */
const uploadsRoot = () => {
  const root = process.env.RUTA_DESTINO;
  if (!root) throw new Error("RUTA_DESTINO no está configurada");
  return path.resolve(root);
};

const baseUrl = (req) =>
  process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

const publicUrlFromRel = (req, rel) =>
  `${baseUrl(req)}/imagenes/${String(rel).replace(/\\/g, "/")}`;

const parseIntOr = (v, def = 0) => {
  const n = parseInt(`${v}`, 10);
  return Number.isFinite(n) ? n : def;
};

/* =========================
   POST /api/images/upload
   - Reemplaza la imagen anterior del mismo "slot"
     (module + entity_id + tag + position) si existe
   - No conserva histórico: borra archivo y fila anterior
========================= */
const uploadImage = async (req, res) => {
  const modulo = String(req.body.module || "")
    .toLowerCase()
    .trim();
  const entityId = parseIntOr(req.body.entity_id, 0);
  const tag = (req.body.tag ?? "").toString().trim();
  const position = parseIntOr(req.body.position, 0);
  const createdBy = req.user?.id ?? null;

  if (!req.file) {
    return res
      .status(400)
      .json({ ok: false, message: "No se recibió el archivo 'image'" });
  }
  if (!modulo || !entityId) {
    return res
      .status(400)
      .json({ ok: false, message: "module y entity_id son obligatorios" });
  }

  // Relativa dentro de /imagenes
  const rel = path.relative(uploadsRoot(), req.file.path).replace(/\\/g, "/");
  const url = publicUrlFromRel(req, rel);

  // Hasta 3 reintentos en deadlock/timeout
  for (let attempt = 1; attempt <= 3; attempt++) {
    const conn = await poolmysql.getConnection();
    try {
      await conn.beginTransaction();

      // 1) Insertamos metadatos del nuevo archivo
      const [fres] = await conn.query(
        `INSERT INTO files (ruta_relativa, mimetype, size, created_by)
         VALUES (?, ?, ?, ?)`,
        [rel, req.file.mimetype, req.file.size, createdBy]
      );
      const newFileId = fres.insertId;

      // 2) Leemos (sin bloquear) el file_id anterior, si existe (para limpieza post-commit)
      let oldFileId = null;
      let oldRel = null;
      {
        const [rowsOld] = await conn.query(
          `SELECT fl.file_id, f.ruta_relativa AS old_rel
           FROM file_links fl
           JOIN files f ON f.id = fl.file_id
           WHERE fl.module=? AND fl.entity_id=? AND fl.tag=? AND fl.position=?`,
          [modulo, entityId, tag, position]
        );
        if (rowsOld.length > 0) {
          oldFileId = rowsOld[0].file_id;
          oldRel = rowsOld[0].old_rel;
        }
      }

      // 3) UPSERT del slot (sin SELECT ... FOR UPDATE)
      await conn.query(
        `INSERT INTO file_links (module, entity_id, tag, position, file_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           file_id = VALUES(file_id),
           created_by = VALUES(created_by),
           created_at = NOW()`,
        [modulo, entityId, tag, position, newFileId, createdBy]
      );

      await conn.commit();

      // 4) Limpieza fuera de la transacción (best-effort)
      if (oldFileId && oldFileId !== newFileId) {
        try {
          await poolmysql.query(`DELETE FROM files WHERE id=?`, [oldFileId]);
          if (oldRel) {
            const abs = path.join(uploadsRoot(), oldRel);
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          }
        } catch (e) {
          console.warn("⚠️ Limpieza del archivo previo falló:", e.message);
        }
      }

      return res.status(201).json({
        ok: true,
        module: modulo,
        entity_id: String(entityId),
        tag,
        position,
        file_id: newFileId,
        filename: req.file.filename,
        ruta_relativa: rel,
        url,
        size: req.file.size,
        mimetype: req.file.mimetype,
        created_at: new Date().toISOString(),
        replaced: Boolean(oldFileId),
      });
    } catch (err) {
      await conn.rollback();

      const code = String(err?.code || "");
      const errno = Number(err?.errno || 0);
      const isDeadlock =
        code === "ER_LOCK_DEADLOCK" ||
        errno === 1213 ||
        code === "ER_LOCK_WAIT_TIMEOUT" ||
        errno === 1205;

      if (isDeadlock && attempt < 3) {
        const wait = 120 + Math.floor(Math.random() * 280);
        console.warn(
          `⚠️ uploadImage retry ${attempt}/3 por ${
            code || errno
          }… esperando ${wait}ms`
        );
        await sleep(wait);
        conn.release();
        continue; // reintentar
      }

      if (/duplicate|uniq/i.test(String(err?.message))) {
        conn.release();
        return res.status(409).json({
          ok: false,
          message:
            "Conflicto de slot (module+entity_id+tag+position). Reintente.",
        });
      }

      console.error("❌ uploadImage error:", err);
      conn.release();

      // Intento de limpieza del archivo recién subido si la tx falló
      try {
        const abs = path.join(uploadsRoot(), rel);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) {}

      return res
        .status(500)
        .json({ ok: false, message: "Error al subir imagen" });
    } finally {
      if (conn && conn.release) conn.release();
    }
  }
};
/* =========================
   GET /api/images/list/:module/:entityId
   - Devuelve las imágenes activas (1 por slot)
   - Filtro opcional por ?tag=...
========================= */
const listImages = async (req, res) => {
  try {
    const modulo = String(req.params.module || "")
      .toLowerCase()
      .trim();
    const entityId = parseIntOr(req.params.entityId, 0);
    const tagFilter =
      req.query.tag !== undefined ? String(req.query.tag).trim() : null;

    if (!modulo || !entityId) {
      return res
        .status(400)
        .json({ ok: false, message: "Parámetros inválidos" });
    }

    let sql = `
      SELECT 
        fl.id             AS file_link_id,
        fl.tag,
        fl.position,
        fl.created_at,
        f.id              AS file_id,
        f.ruta_relativa,
        f.mimetype,
        f.size
      FROM file_links fl
      JOIN files f ON f.id = fl.file_id
      WHERE fl.module=? AND fl.entity_id=?
    `;
    const params = [modulo, entityId];

    if (tagFilter !== null) {
      sql += ` AND fl.tag = ? `;
      params.push(tagFilter);
    }

    sql += ` ORDER BY fl.tag, fl.position, fl.created_at DESC`;

    const [rows] = await poolmysql.query(sql, params);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, message: "No hay imágenes" });
    }

    const imagenes = rows.map((r) => ({
      id: r.file_link_id,
      tag: r.tag,
      position: r.position,
      filename: path.basename(r.ruta_relativa),
      ruta_relativa: r.ruta_relativa,
      url: publicUrlFromRel(req, r.ruta_relativa),
      mimetype: r.mimetype,
      size: r.size,
      created_at: r.created_at,
    }));

    return res.json({
      ok: true,
      module: modulo,
      entity_id: String(entityId),
      imagenes,
    });
  } catch (err) {
    console.error("❌ listImages error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al listar imágenes" });
  }
};

/**
 * GET /api/images/visitas/by-ord/:ord_ins
 * Devuelve TODAS las visitas (neg_t_vis) de un ord_ins y sus imágenes
 * desde el esquema nuevo (files + file_links) con module='visitas'.
 */
// Reemplaza la función por esta versión:
// GET /api/images/visitas/by-ord/:ord_ins
async function listVisitasWithImagesByOrdIns(req, res) {
  const { ord_ins } = req.params;

  if (!ord_ins || isNaN(Number(ord_ins))) {
    return res.status(400).json({ ok: false, message: "ord_ins inválido" });
  }

  try {
    const sql = `
      SELECT
        v.id                  AS vis_id,
        v.vis_tipo,
        v.vis_estado,
        v.vis_diagnostico,
        v.vis_coment_cliente,
        v.vis_solucion,
        v.fecha_actualizacion,

        fl.id                 AS link_id,
        fl.tag                AS link_tag,
        fl.position           AS link_position,
        f.ruta_relativa       AS file_rel
      FROM neg_t_vis v
      LEFT JOIN file_links fl
             ON fl.module = 'visitas'
            AND fl.entity_id = v.id
      LEFT JOIN files f
             ON f.id = fl.file_id
      WHERE v.ord_ins = ?
      ORDER BY v.id DESC, fl.position ASC, fl.id ASC
    `;

    const [rows] = await poolmysql.query(sql, [ord_ins]);

    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ ok: false, message: "No se encontraron visitas" });
    }

    const visitasMap = new Map();

    for (const r of rows) {
      const visId = r.vis_id;
      if (!visitasMap.has(visId)) {
        visitasMap.set(visId, {
          id: r.vis_id,
          vis_tipo: r.vis_tipo,
          vis_estado: r.vis_estado,
          vis_diagnostico: r.vis_diagnostico,
          vis_coment_cliente: r.vis_coment_cliente,
          vis_solucion: r.vis_solucion,
          fecha_actualizacion: r.fecha_actualizacion,
          imagenes: {},
        });
      }

      // Si hay imagen vinculada
      if (r.link_id && r.file_rel) {
        const tag = (r.link_tag || "otros").trim();
        const key =
          tag === "img" && typeof r.link_position === "number"
            ? `img_${r.link_position}`
            : tag || "otros";

        const rel = r.file_rel;
        const url = publicUrlFromRel(req, rel);
        visitasMap.get(visId).imagenes[key] = { url, ruta: rel };
      }
    }

    const out = Array.from(visitasMap.values());
    return res.status(200).json(out);
  } catch (error) {
    console.error("❌ listVisitasWithImagesByOrdIns:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al obtener visitas",
      error: error.message,
    });
  }
}

module.exports = {
  uploadImage,
  listImages,
  listVisitasWithImagesByOrdIns,
};
