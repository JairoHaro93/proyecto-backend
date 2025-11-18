// src/controllers/images_controller.js
"use strict";

const path = require("path");
const fs = require("fs");
const { poolmysql } = require("../../config/db"); // ajusta la ruta si tu estructura difiere
const { ALLOWED_MODULES } = require("../../utils/multer");

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
const parseIntOr = (v, d = 0) => {
  const n = parseInt(`${v}`, 10);
  return Number.isFinite(n) ? n : d;
};
const ensureDirSync = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resuelve ord_ins desde la agenda
async function getAgendaOrdInsById(ageId) {
  const [rows] = await poolmysql.query(
    `SELECT ord_ins FROM neg_t_agenda WHERE id = ? LIMIT 1`,
    [ageId]
  );
  return rows[0]?.ord_ins || null;
}

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

  // === Construir ruta final y mover si es visita ===
  let finalAbs = req.file.path; // por defecto: donde lo dejó multer (/<module>/<entity_id>/...)
  let rel;

  if (modulo === "visitas") {
    // 1) Resolver ord_ins: body.ord_ins o BD (neg_t_agenda.id = entity_id)
    const ordInsFromBody = (req.body.ord_ins ?? "").toString().trim();
    const ordIns =
      ordInsFromBody !== ""
        ? ordInsFromBody
        : await getAgendaOrdInsById(entityId);

    if (!ordIns) {
      // Limpieza del archivo que subió multer si no podemos moverlo
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
      return res
        .status(400)
        .json({
          ok: false,
          message: "ord_ins requerido o no resolvible para visitas",
        });
    }

    // 2) Carpeta final: instalaciones/<ord_ins>/<age_id>
    const destDir = path.join(
      uploadsRoot(),
      "instalaciones",
      String(ordIns),
      String(entityId)
    );
    ensureDirSync(destDir);

    // 3) Mover el archivo desde donde lo dejó multer → carpeta final
    const destAbs = path.join(destDir, req.file.filename);
    // (si por alguna razón existe, lo reemplazamos)
    if (fs.existsSync(destAbs)) {
      try {
        fs.unlinkSync(destAbs);
      } catch (_) {}
    }
    fs.renameSync(req.file.path, destAbs);

    finalAbs = destAbs; // importante: desde aquí usamos la ruta movida
  }

  // 4) Calcular la ruta relativa (la que guardamos en 'files.ruta_relativa')
  rel = path.relative(uploadsRoot(), finalAbs).replace(/\\/g, "/");
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

/* =================================================================== *
 *  A) LISTAR TODO POR ord_ins  (instalaciones + visitas agrupadas)
 * =================================================================== */
async function listImagesByOrdIns(req, res) {
  const { ord_ins } = req.params;
  if (!ord_ins || !/^\d+$/.test(String(ord_ins))) {
    return res.status(400).json({ ok: false, message: "ord_ins inválido" });
  }

  try {
    // Traemos agenda + file_links/files para modulos instalaciones/visitas
    const [rows] = await poolmysql.query(
      `
      SELECT
        a.id               AS age_id,
        a.age_tipo,
        a.age_fecha,
        a.age_estado,
        fl.module,
        fl.tag,
        fl.position,
        f.ruta_relativa
      FROM neg_t_agenda a
      LEFT JOIN file_links fl
             ON fl.entity_id = a.id
            AND fl.module IN ('instalaciones','visitas')
      LEFT JOIN files f
             ON f.id = fl.file_id
      WHERE a.ord_ins = ?
      ORDER BY a.id DESC, fl.module ASC, fl.tag ASC, fl.position ASC
      `,
      [ord_ins]
    );

    if (!rows || rows.length === 0) {
      // No hay agenda ni imágenes para ese ord_ins
      return res.status(404).json({ ok: false, message: "Sin resultados" });
    }

    // Estructura de salida:
    // {
    //   ord_ins,
    //   instalaciones: { tag: [{position,url,ruta}], ... },
    //   visitas: [{ age_id, fecha, estado, imagenes: [{tag,position,url,ruta}] }]
    // }
    const out = {
      ok: true,
      ord_ins: String(ord_ins),
      instalaciones: {},
      visitas: [],
    };

    // Agrupar visitas por age_id
    const visitasMap = new Map();

    for (const r of rows) {
      // Sin imágenes (fl.* nulo) también nos sirve para crear contenedores
      const hasImg = r.ruta_relativa && r.tag != null && r.position != null;
      const imgObj = hasImg
        ? {
            tag: r.tag,
            position: Number(r.position) || 0,
            ruta: r.ruta_relativa,
            url: publicUrlFromRel(req, r.ruta_relativa),
          }
        : null;

      const tipo = String(r.age_tipo || "")
        .toUpperCase()
        .trim();
      const module = r.module ? String(r.module).toLowerCase() : null;

      if (module === "instalaciones") {
        if (imgObj) {
          if (!out.instalaciones[imgObj.tag])
            out.instalaciones[imgObj.tag] = [];
          out.instalaciones[imgObj.tag].push({
            position: imgObj.position,
            ruta: imgObj.ruta,
            url: imgObj.url,
          });
        }
      } else if (module === "visitas" || tipo === "VISITA" || tipo === "LOS") {
        // Creamos entrada de visita aunque no tenga imagen, para contexto
        if (!visitasMap.has(r.age_id)) {
          visitasMap.set(r.age_id, {
            age_id: r.age_id,
            fecha: r.age_fecha,
            estado: r.age_estado,
            imagenes: [],
          });
        }
        if (imgObj) {
          visitasMap.get(r.age_id).imagenes.push({
            tag: imgObj.tag,
            position: imgObj.position,
            ruta: imgObj.ruta,
            url: imgObj.url,
          });
        }
      }
    }

    out.visitas = Array.from(visitasMap.values());
    return res.json(out);
  } catch (err) {
    console.error("❌ listImagesByOrdIns error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al listar por ord_ins" });
  }
}

/* =================================================================== *
 *  B) BORRAR SLOT (module + entity_id + tag + position)
 * =================================================================== */
async function deleteImageSlot(req, res) {
  try {
    const modulo = String(req.body.module || "")
      .toLowerCase()
      .trim();
    const entityId = parseIntOr(req.body.entity_id, 0);
    const tag = (req.body.tag ?? "").toString().trim();
    const position = parseIntOr(req.body.position, 0);

    if (!ALLOWED_MODULES.has(modulo))
      return res
        .status(400)
        .json({ ok: false, message: `module inválido: ${modulo}` });
    if (!entityId)
      return res.status(400).json({ ok: false, message: "entity_id inválido" });
    if (!tag)
      return res.status(400).json({ ok: false, message: "tag requerido" });

    // Busca el link + file
    const [rows] = await poolmysql.query(
      `
      SELECT fl.id AS link_id, f.id AS file_id, f.ruta_relativa
      FROM file_links fl
      JOIN files f ON f.id = fl.file_id
      WHERE fl.module = ? AND fl.entity_id = ? AND fl.tag = ? AND fl.position = ?
      LIMIT 1
      `,
      [modulo, entityId, tag, position]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Slot no encontrado" });
    }

    const { link_id, file_id, ruta_relativa } = rows[0];

    // Borra file_link (la FK permite borrar files sin problemas también,
    // pero hacemos explícito el orden para claridad)
    await poolmysql.query(`DELETE FROM file_links WHERE id = ?`, [link_id]);

    // Borra metadatos y archivo físico
    await poolmysql.query(`DELETE FROM files WHERE id = ?`, [file_id]);

    try {
      const abs = path.join(uploadsRoot(), ruta_relativa);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (e) {
      console.warn("⚠️ No se pudo eliminar el archivo físico:", e.message);
    }

    return res.json({ ok: true, message: "Slot eliminado" });
  } catch (err) {
    console.error("❌ deleteImageSlot error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al eliminar slot" });
  }
}

module.exports = {
  uploadImage,
  listImages,
  listVisitasWithImagesByOrdIns,

  listImagesByOrdIns,
  deleteImageSlot,
};
