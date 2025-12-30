// src/controllers/sistema/files.controllers.js
"use strict";

const fs = require("fs");
const path = require("path");

const {
  selectFileById,
  selectFileLinksByFileId,
  selectVacAsignacionOwner,
} = require("../../models/sistema/files.models");

// -------- Helpers --------
function hasAnyRole(user, roles = []) {
  const arr = Array.isArray(user?.rol) ? user.rol : [];
  return roles.some((r) => arr.includes(r));
}

function pickRootByRutaRelativa(rutaRelativa) {
  // docs/... => usa RUTA_DOCS_ROOT
  const docsRoot = process.env.RUTA_DOCS_ROOT;
  const imagesRoot = process.env.RUTA_DESTINO;

  const rel = String(rutaRelativa || "");

  if (rel.startsWith("docs/")) {
    // si no está definido, cae a RUTA_DESTINO para no romper dev
    return docsRoot || imagesRoot || "uploads";
  }

  return imagesRoot || "uploads";
}

function safeResolve(root, relPath) {
  const absRoot = path.resolve(root);
  const absFile = path.resolve(root, relPath);

  // 🔒 evita path traversal (../)
  if (absFile !== absRoot && !absFile.startsWith(absRoot + path.sep)) {
    return null;
  }
  return absFile;
}

async function canDownload(reqUser, links) {
  // Si no hay links, dejamos permitido solo a roles admin/jefe (para no exponer IDs al azar)
  if (!links?.length) {
    return hasAnyRole(reqUser, ["AUsuarios", "ATurnos", "AHorarios"]);
  }

  // Si el archivo está vinculado a VACACIONES:
  const vacLink = links.find((l) => String(l.module) === "vacaciones");
  if (vacLink) {
    // Jefe / admin del módulo puede descargar
    if (hasAnyRole(reqUser, ["ATurnos", "AHorarios"])) return true;

    // Trabajador dueño de esa asignación también
    const asig = await selectVacAsignacionOwner(Number(vacLink.entity_id));
    if (!asig) return false;
    return Number(asig.usuario_id) === Number(reqUser?.id);
  }

  // Para otros módulos (futuro):
  // Permitimos si el archivo fue creado por el mismo usuario o es admin del sistema.
  if (hasAnyRole(reqUser, ["AUsuarios"])) return true;

  const createdBy = links[0]?.created_by;
  if (createdBy != null && Number(createdBy) === Number(reqUser?.id))
    return true;

  // por defecto denegado (privado)
  return false;
}

// -------- Controllers --------
async function getFileMetaById(req, res) {
  try {
    const fileId = Number(req.params.fileId);
    if (Number.isNaN(fileId)) {
      return res.status(400).json({ message: "fileId inválido" });
    }

    const file = await selectFileById(fileId);
    if (!file) return res.status(404).json({ message: "Archivo no existe" });

    const links = await selectFileLinksByFileId(fileId);

    const ok = await canDownload(req.user, links);
    if (!ok) return res.status(403).json({ message: "No autorizado" });

    return res.json({
      ...file,
      links,
      download_url: `/api/files/${fileId}/download`,
    });
  } catch (err) {
    console.error("❌ getFileMetaById:", err);
    return res
      .status(500)
      .json({ message: "Error interno", error: String(err) });
  }
}

async function downloadFileById(req, res) {
  try {
    const fileId = Number(req.params.fileId);
    if (Number.isNaN(fileId)) {
      return res.status(400).json({ message: "fileId inválido" });
    }

    const file = await selectFileById(fileId);
    if (!file) return res.status(404).json({ message: "Archivo no existe" });

    const links = await selectFileLinksByFileId(fileId);

    const ok = await canDownload(req.user, links);
    if (!ok) return res.status(403).json({ message: "No autorizado" });

    const root = pickRootByRutaRelativa(file.ruta_relativa);
    const absPath = safeResolve(root, file.ruta_relativa);

    if (!absPath) return res.status(400).json({ message: "Ruta inválida" });
    if (!fs.existsSync(absPath)) {
      return res
        .status(404)
        .json({ message: "Archivo no encontrado en disco" });
    }

    const filename = path.basename(file.ruta_relativa || `file_${fileId}`);
    res.setHeader("Content-Type", file.mimetype || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.sendFile(absPath);
  } catch (err) {
    console.error("❌ downloadFileById:", err);
    return res
      .status(500)
      .json({ message: "Error interno", error: String(err) });
  }
}

module.exports = {
  getFileMetaById,
  downloadFileById,
};
