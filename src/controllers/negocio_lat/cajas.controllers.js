// controllers/negocio_lat/cajas.controllers.js
const {
  insertCaja,
  listCajas,
  selectCajaById,
  updateCajaById,

  // splitters / ocupación
  listSplittersByCaja,
  insertSplitter,
  listNapRoutesByPon,
  countClientesByNap,

  // ✅ nuevas para cálculo eficiente en getCajas
  countClientesByNapIds,
  countNapsByPonIds,
  listSplittersByCajaIds,
} = require("../../models/negocio_lat/cajas.model");

// ---------- helpers ----------
const VALID_SPLITS = new Set([2, 8, 16]);

function toInt(v, def) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeCoords(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  const parts = str.split(",").map((x) => x.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function isCoordPair(s) {
  return (
    typeof s === "string" && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s.trim())
  );
}

function isRutaPath(s) {
  // 5 | 7/2 | 7/2/1
  return typeof s === "string" && /^\d+(\/\d+)*$/.test(s.trim());
}

function cityAbbr(ciudad) {
  const c = String(ciudad || "")
    .toUpperCase()
    .trim();
  if (c === "LATACUNGA") return "LAT";
  if (c === "SALCEDO") return "SAL";
  return c ? c.slice(0, 3) : "XXX";
}

function depth(path) {
  return String(path).split("/").length;
}

function compareRuta(a, b) {
  const as = String(a).split("/");
  const bs = String(b).split("/");
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const av = as[i];
    const bv = bs[i];
    if (av == null) return -1;
    if (bv == null) return 1;
    const an = Number(av),
      bn = Number(bv);
    const aNum = Number.isFinite(an),
      bNum = Number.isFinite(bn);
    if (aNum && bNum && an !== bn) return an - bn;
    if (av !== bv) return av.localeCompare(bv);
  }
  return 0;
}

function computeLeafPaths(rootSplit, splitters = []) {
  const r = Number(rootSplit);
  if (!VALID_SPLITS.has(r)) return [];

  let leaves = new Set(Array.from({ length: r }, (_, i) => String(i + 1)));

  // aplicar splitters en orden: de menor profundidad a mayor
  const sorted = [...splitters].sort((a, b) => {
    const da = depth(a.path),
      db = depth(b.path);
    if (da !== db) return da - db;
    return compareRuta(a.path, b.path);
  });

  for (const s of sorted) {
    const path = String(s.path).trim();
    const factor = Number(s.factor);
    if (!isRutaPath(path) || !VALID_SPLITS.has(factor)) continue;

    // solo aplica si el path existe como hoja
    if (!leaves.has(path)) continue;

    leaves.delete(path);
    for (let i = 1; i <= factor; i++) {
      leaves.add(`${path}/${i}`);
    }
  }

  return Array.from(leaves).sort(compareRuta);
}

async function getCajaOr404(id, res) {
  const [rows] = await selectCajaById(id);
  const caja = rows?.[0];
  if (!caja) {
    res.status(404).json({ success: false, message: "Caja no encontrada" });
    return null;
  }
  return caja;
}

// ---------- LEGACY (tu base actual) ----------
async function createCaja(req, res) {
  try {
    const {
      caja_tipo,
      caja_nombre,
      caja_estado,
      caja_hilo,
      caja_coordenadas,
      caja_ciudad,
      caja_observacion,

      // nuevos campos (opcionales en legacy)
      caja_root_split,
      caja_segmento,
      caja_pon_id,
      caja_pon_ruta,
    } = req.body;

    if (!caja_tipo || !caja_nombre) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: caja_tipo o caja_nombre",
      });
    }

    const coordsNorm = caja_coordenadas
      ? normalizeCoords(caja_coordenadas)
      : null;

    const [result] = await insertCaja({
      caja_ciudad,
      caja_tipo,
      caja_estado: caja_estado || "DISEÑO",
      caja_nombre,
      caja_hilo,
      caja_coordenadas: coordsNorm ?? caja_coordenadas ?? null,
      caja_observacion,

      caja_root_split,
      caja_segmento,
      caja_pon_id,
      caja_pon_ruta,
    });

    return res.status(201).json({
      success: true,
      message: "Caja creada correctamente",
      data: {
        id: result.insertId,
        caja_ciudad: caja_ciudad ?? null,
        caja_tipo,
        caja_estado: caja_estado || "DISEÑO",
        caja_nombre,
        caja_hilo: caja_hilo ?? null,
        caja_coordenadas: coordsNorm ?? caja_coordenadas ?? null,

        caja_root_split: caja_root_split ?? null,
        caja_segmento: caja_segmento ?? null,
        caja_pon_id: caja_pon_id ?? null,
        caja_pon_ruta: caja_pon_ruta ?? null,
      },
    });
  } catch (error) {
    console.error("Error al crear la caja:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear la caja",
    });
  }
}

async function getCajas(req, res) {
  try {
    const { ciudad, tipo, estado, q, ne, sw } = req.query;
    const limit = Math.min(Math.max(toInt(req.query.limit, 500), 1), 5000);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    if ((ne && !sw) || (!ne && sw)) {
      return res.status(400).json({
        success: false,
        message: "Para bbox envía ne y sw juntos (formato: lat,lng).",
      });
    }
    if (ne && sw && (!isCoordPair(String(ne)) || !isCoordPair(String(sw)))) {
      return res.status(400).json({
        success: false,
        message: "ne/sw inválidos. Formato esperado: lat,lng",
      });
    }

    const [rows] = await listCajas({
      ciudad,
      tipo,
      estado,
      q,
      ne: ne ? String(ne).trim() : null,
      sw: sw ? String(sw).trim() : null,
      limit,
      offset,
    });

    const cajas = rows || [];
    if (!cajas.length) {
      return res.json({
        success: true,
        message: "Cajas obtenidas correctamente",
        data: [],
      });
    }

    // separar ids
    const ponIds = [];
    const napIds = [];

    for (const c of cajas) {
      const t = String(c.caja_tipo || "")
        .toUpperCase()
        .trim();
      if (t === "PON") ponIds.push(c.id);
      if (t === "NAP") napIds.push(c.id);
    }

    // === 1) NAP usados (clientes) ===
    const napUsed = new Map();
    if (napIds.length) {
      const [napUsedRows] = await countClientesByNapIds(napIds);
      for (const r of napUsedRows || []) {
        napUsed.set(Number(r.nap_id), Number(r.usados || 0));
      }
    }

    // === 2) PON usados (NAPs colgadas) ===
    const ponUsed = new Map();
    if (ponIds.length) {
      const [ponUsedRows] = await countNapsByPonIds(ponIds);
      for (const r of ponUsedRows || []) {
        ponUsed.set(Number(r.pon_id), Number(r.usados || 0));
      }
    }

    // === 3) Splitters por PON ===
    const splByCaja = new Map(); // ponId -> [{path,factor}]
    if (ponIds.length) {
      const [splRows] = await listSplittersByCajaIds(ponIds);
      for (const s of splRows || []) {
        const cid = Number(s.caja_id);
        if (!splByCaja.has(cid)) splByCaja.set(cid, []);
        splByCaja.get(cid).push({ path: s.path, factor: s.factor });
      }
    }

    // === 4) Enriquecer con capacidad/usados/disponibles/full ===
    const data = cajas.map((c) => {
      const t = String(c.caja_tipo || "")
        .toUpperCase()
        .trim();
      const root = Number(c.caja_root_split);

      let capacidad = 0;
      let usados = 0;

      if (t === "NAP") {
        capacidad = VALID_SPLITS.has(root) ? root : 0;
        usados = napUsed.get(c.id) ?? 0;
      } else if (t === "PON") {
        const splitters = splByCaja.get(c.id) ?? [];
        const leaves = computeLeafPaths(root, splitters);
        capacidad = leaves.length;
        usados = ponUsed.get(c.id) ?? 0;
      }

      const disponibles = Math.max(0, capacidad - usados);
      const full = disponibles <= 0;

      return { ...c, capacidad, usados, disponibles, full };
    });

    return res.json({
      success: true,
      message: "Cajas obtenidas correctamente",
      data,
    });
  } catch (error) {
    console.error("Error al listar cajas:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al listar las cajas",
    });
  }
}
async function getCajaById(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id)
      return res.status(400).json({ success: false, message: "ID inválido" });

    const caja = await getCajaOr404(id, res);
    if (!caja) return;

    res.json({
      success: true,
      message: "Caja obtenida correctamente",
      data: caja,
    });
  } catch (error) {
    console.error("Error al obtener caja:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener la caja",
    });
  }
}

async function updateCaja(req, res) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) {
      return res.status(400).json({ success: false, message: "ID inválido" });
    }

    // 1) Construir patch
    const patch = {
      caja_ciudad: req.body.caja_ciudad,
      caja_tipo: req.body.caja_tipo,
      caja_estado: req.body.caja_estado,
      caja_nombre: req.body.caja_nombre,
      caja_hilo: req.body.caja_hilo,
      caja_coordenadas: req.body.caja_coordenadas,
      caja_observacion: req.body.caja_observacion,

      // nuevos
      caja_root_split: req.body.caja_root_split,
      caja_segmento: req.body.caja_segmento,
      caja_pon_id: req.body.caja_pon_id,
      caja_pon_ruta: req.body.caja_pon_ruta,
    };

    // 2) Verificar que venga algo
    const hasAny = Object.values(patch).some((v) => v !== undefined);
    if (!hasAny) {
      return res.status(400).json({
        success: false,
        message: "No se enviaron campos para actualizar",
      });
    }

    // 3) Obtener caja actual para aplicar reglas por tipo
    const caja = await getCajaOr404(id, res);
    if (!caja) return;

    const tipo = String(caja.caja_tipo || "").toUpperCase();

    if (tipo === "NAP") {
      // NO permitir que cambien estos campos en NAP (heredados del PON)
      delete patch.caja_ciudad;
      delete patch.caja_segmento;

      // recomendado: bloquear mover NAP de PON o cambiar puerto desde PUT genérico
      delete patch.caja_pon_id;
      delete patch.caja_pon_ruta;
    }

    // 4) Normalizar/validar coords si vienen
    if (patch.caja_coordenadas !== undefined) {
      const v = patch.caja_coordenadas;
      if (
        v !== null &&
        v !== "" &&
        !isCoordPair(String(v).replace(/\s+/g, ""))
      ) {
        return res.status(400).json({
          success: false,
          message: "caja_coordenadas inválidas. Formato esperado: lat,lng",
        });
      }
      patch.caja_coordenadas = v === "" ? null : (normalizeCoords(v) ?? v);
    }

    // 5) Ejecutar update
    const [result] = await updateCajaById(id, patch);
    if (!result.affectedRows) {
      return res
        .status(404)
        .json({ success: false, message: "Caja no encontrada" });
    }

    return res.json({
      success: true,
      message: "Caja actualizada correctamente",
      data: { id, ...patch },
    });
  } catch (error) {
    console.error("Error al actualizar caja:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al actualizar la caja",
    });
  }
}
// ---------- NUEVO: PON / NAP ----------

async function createPon(req, res) {
  try {
    const {
      caja_ciudad,
      caja_segmento,
      caja_root_split,
      caja_estado,
      caja_hilo,
      caja_coordenadas,
      caja_observacion,
    } = req.body;

    const root = Number(caja_root_split);
    if (!caja_ciudad || !caja_segmento || !VALID_SPLITS.has(root)) {
      return res.status(400).json({
        success: false,
        message:
          "Requerido: caja_ciudad, caja_segmento y caja_root_split (2|8|16)",
      });
    }

    const abbr = cityAbbr(caja_ciudad);
    const nombre = `${abbr}-PON-${String(caja_segmento).trim()}-R${root}`;
    const coordsNorm = caja_coordenadas
      ? normalizeCoords(caja_coordenadas)
      : null;

    const [result] = await insertCaja({
      caja_ciudad,
      caja_tipo: "PON",
      caja_estado: caja_estado || "DISEÑO",
      caja_nombre: nombre,
      caja_hilo: caja_hilo ?? null,
      caja_coordenadas: coordsNorm ?? null,
      caja_observacion: caja_observacion ?? null,

      caja_root_split: root,
      caja_segmento: String(caja_segmento).trim(),
      caja_pon_id: null,
      caja_pon_ruta: null,
    });

    res.status(201).json({
      success: true,
      message: "PON creada correctamente",
      data: { id: result.insertId, caja_nombre: nombre },
    });
  } catch (error) {
    console.error("Error al crear PON:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear PON",
    });
  }
}

async function createNap(req, res) {
  try {
    const {
      caja_root_split, // split hacia clientes (2|8|16)
      caja_estado,
      caja_hilo,
      caja_coordenadas,
      caja_observacion,

      caja_pon_id,
      caja_pon_ruta, // "5" o "7/2"
    } = req.body;

    const root = Number(caja_root_split);
    const ponId = Number(caja_pon_id);
    const ruta = String(caja_pon_ruta || "").trim();

    // ✅ ya NO pedimos ciudad ni segmento aquí
    if (!VALID_SPLITS.has(root) || !ponId || !isRutaPath(ruta)) {
      return res.status(400).json({
        success: false,
        message:
          "Requerido: caja_root_split (2|8|16), caja_pon_id y caja_pon_ruta (ej: 5 o 7/2)",
      });
    }

    const pon = await getCajaOr404(ponId, res);
    if (!pon) return;

    if (String(pon.caja_tipo || "").toUpperCase() !== "PON") {
      return res.status(400).json({
        success: false,
        message: "caja_pon_id debe ser una caja tipo PON",
      });
    }

    // ✅ heredados del PON (OBLIGATORIO que el PON los tenga)
    const ciudadHeredada = String(pon.caja_ciudad || "").trim();
    const segHeredado = String(pon.caja_segmento || "").trim();

    if (!ciudadHeredada || !segHeredado) {
      return res.status(400).json({
        success: false,
        message:
          "El PON padre no tiene caja_ciudad/caja_segmento. Corrige el PON.",
      });
    }

    // validar que la ruta esté disponible en la PON
    const [splRows] = await listSplittersByCaja(ponId);
    const leaves = computeLeafPaths(pon.caja_root_split, splRows || []);
    if (!leaves.length) {
      return res.status(400).json({
        success: false,
        message: "La PON no tiene caja_root_split válido",
      });
    }

    const [napRoutesRows] = await listNapRoutesByPon(ponId);
    const used = new Set(
      (napRoutesRows || [])
        .map((r) => String(r.caja_pon_ruta || "").trim())
        .filter(Boolean),
    );

    const available = leaves.filter((p) => !used.has(p));
    if (!available.includes(ruta)) {
      return res.status(409).json({
        success: false,
        message: "Puerto no disponible en la PON. Intenta con otro.",
        data: { puerto: ruta, disponibles: available.slice(0, 200) },
      });
    }

    const abbr = cityAbbr(ciudadHeredada);
    const nombre = `${abbr}-NAP-${segHeredado}-P${ruta}-R${root}`;
    const coordsNorm = caja_coordenadas
      ? normalizeCoords(caja_coordenadas)
      : null;

    const [result] = await insertCaja({
      caja_ciudad: ciudadHeredada,
      caja_tipo: "NAP",
      caja_estado: caja_estado || "DISEÑO",
      caja_nombre: nombre,
      caja_hilo: caja_hilo ?? null,
      caja_coordenadas: coordsNorm ?? null,
      caja_observacion: caja_observacion ?? null,

      caja_root_split: root,
      caja_segmento: segHeredado,
      caja_pon_id: ponId,
      caja_pon_ruta: ruta,
    });

    return res.status(201).json({
      success: true,
      message: "NAP creada correctamente",
      data: {
        id: result.insertId,
        caja_nombre: nombre,
        caja_pon_id: ponId,
        caja_pon_ruta: ruta,
      },
    });
  } catch (error) {
    console.error("Error al crear NAP:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear NAP",
    });
  }
}
// Registrar un splitter (expansión) en una caja
// IMPORTANTE: en esta v1, lo usamos para PON (y también podría ser NAP si luego migramos clientes a rutas).
async function addCajaSplitter(req, res) {
  try {
    const cajaId = toInt(req.params.id, 0);
    if (!cajaId)
      return res.status(400).json({ success: false, message: "ID inválido" });

    const { path, factor } = req.body;
    const p = String(path || "").trim();
    const f = Number(factor);

    if (!isRutaPath(p) || !VALID_SPLITS.has(f)) {
      return res.status(400).json({
        success: false,
        message: "Requerido: path (ej: 7 o 7/2) y factor (2|8|16)",
      });
    }

    const caja = await getCajaOr404(cajaId, res);
    if (!caja) return;

    // obtener hojas actuales
    const [splRows] = await listSplittersByCaja(cajaId);
    const leaves = computeLeafPaths(caja.caja_root_split, splRows || []);
    if (!leaves.includes(p)) {
      return res.status(409).json({
        success: false,
        message: "El path no es una hoja disponible para expandir",
        data: { path: p, hojas: leaves.slice(0, 200) },
      });
    }

    // si es PON, no permitir expandir un path ya ocupado por una NAP
    if (String(caja.caja_tipo || "").toUpperCase() === "PON") {
      const [napRoutesRows] = await listNapRoutesByPon(cajaId);
      const used = new Set(
        (napRoutesRows || []).map((r) => String(r.caja_pon_ruta || "").trim()),
      );
      if (used.has(p)) {
        return res.status(409).json({
          success: false,
          message: "No se puede expandir: esa ruta ya está ocupada por una NAP",
          data: { path: p },
        });
      }
    }

    await insertSplitter(cajaId, p, f);

    res.status(201).json({
      success: true,
      message: "Splitter registrado",
      data: { caja_id: cajaId, path: p, factor: f },
    });
  } catch (error) {
    console.error("Error al registrar splitter:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno al registrar splitter" });
  }
}

// Disponibilidad (capacidad/usados/disponibles) según tipo
async function getCajaDisponibilidad(req, res) {
  try {
    const cajaId = toInt(req.params.id, 0);
    if (!cajaId)
      return res.status(400).json({ success: false, message: "ID inválido" });

    const caja = await getCajaOr404(cajaId, res);
    if (!caja) return;

    const tipo = String(caja.caja_tipo || "").toUpperCase();

    if (tipo === "PON") {
      const [splRows] = await listSplittersByCaja(cajaId);
      const leaves = computeLeafPaths(caja.caja_root_split, splRows || []);

      const [napRoutesRows] = await listNapRoutesByPon(cajaId);
      const used = new Set(
        (napRoutesRows || [])
          .map((r) => String(r.caja_pon_ruta || "").trim())
          .filter(Boolean),
      );

      const capacidad = leaves.length;
      const usados = Array.from(used).filter((r) => leaves.includes(r)).length; // consistentes
      const disponibles = Math.max(0, capacidad - usados);

      return res.json({
        success: true,
        message: "Disponibilidad PON",
        data: { caja_id: cajaId, tipo, capacidad, usados, disponibles },
      });
    }

    if (tipo === "NAP") {
      const root = Number(caja.caja_root_split);
      if (!VALID_SPLITS.has(root)) {
        return res.status(400).json({
          success: false,
          message: "NAP sin caja_root_split válido (2|8|16)",
        });
      }

      const [cntRows] = await countClientesByNap(cajaId);
      const usados = Number(cntRows?.[0]?.usados || 0);
      const capacidad = root; // v1: NAP capacidad = root_split (2/8/16)
      const disponibles = Math.max(0, capacidad - usados);

      return res.json({
        success: true,
        message: "Disponibilidad NAP",
        data: { caja_id: cajaId, tipo, capacidad, usados, disponibles },
      });
    }

    res.status(400).json({
      success: false,
      message: "Tipo de caja no soportado para disponibilidad",
    });
  } catch (error) {
    console.error("Error disponibilidad:", error);
    res.status(500).json({
      success: false,
      message: "Error interno al calcular disponibilidad",
    });
  }
}

// Rutas disponibles para colgar NAPs (solo PON)
async function getCajaRutasDisponibles(req, res) {
  try {
    const cajaId = toInt(req.params.id, 0);
    if (!cajaId)
      return res.status(400).json({ success: false, message: "ID inválido" });

    const caja = await getCajaOr404(cajaId, res);
    if (!caja) return;

    const tipo = String(caja.caja_tipo || "").toUpperCase();
    if (tipo !== "PON") {
      return res
        .status(400)
        .json({ success: false, message: "Este endpoint aplica solo a PON" });
    }

    const [splRows] = await listSplittersByCaja(cajaId);
    const leaves = computeLeafPaths(caja.caja_root_split, splRows || []);

    const [napRoutesRows] = await listNapRoutesByPon(cajaId);
    const used = new Set(
      (napRoutesRows || [])
        .map((r) => String(r.caja_pon_ruta || "").trim())
        .filter(Boolean),
    );

    const disponibles = leaves.filter((p) => !used.has(p));

    res.json({
      success: true,
      message: "Rutas disponibles",
      data: {
        caja_id: cajaId,
        capacidad: leaves.length,
        usadas: used.size,
        disponibles,
      },
    });
  } catch (error) {
    console.error("Error rutas disponibles:", error);
    res.status(500).json({
      success: false,
      message: "Error interno al obtener rutas disponibles",
    });
  }
}

async function getDisponibilidadBatch(req, res) {
  try {
    let ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    ids = [
      ...new Set(
        ids
          .map((x) => Number.parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];

    // evita matar el server si el viewport devuelve demasiados
    ids = ids.slice(0, 300);

    if (!ids.length) {
      return res.json({ success: true, message: "OK", data: [] });
    }

    const data = [];

    for (const id of ids) {
      // 1) caja
      const [rows] = await selectCajaById(id);
      const caja = rows?.[0];
      if (!caja) continue;

      const tipo = String(caja.caja_tipo || "")
        .toUpperCase()
        .trim();

      // 2) NAP -> capacidad = root_split; usados = COUNT clientes
      if (tipo === "NAP") {
        const root = Number(caja.caja_root_split);
        const capacidad = Number.isFinite(root) ? root : 0;

        const [cntRows] = await countClientesByNap(id);
        const usados = Number(cntRows?.[0]?.usados || 0);

        data.push({
          id,
          tipo,
          capacidad,
          usados,
          disponibles: Math.max(0, capacidad - usados),
        });
        continue;
      }

      // 3) PON -> capacidad = hojas del árbol; usados = NAPs colgadas
      if (tipo === "PON") {
        const root = Number(caja.caja_root_split);

        const [splRows] = await listSplittersByCaja(id);
        const leaves = computeLeafPaths(root, splRows || []);
        const capacidad = leaves.length;

        const [napRows] = await listNapRoutesByPon(id);
        const usados = (napRows || []).length;

        data.push({
          id,
          tipo,
          capacidad,
          usados,
          disponibles: Math.max(0, capacidad - usados),
        });
        continue;
      }

      // otros tipos (si existieran)
      data.push({ id, tipo, capacidad: 0, usados: 0, disponibles: 0 });
    }

    return res.json({
      success: true,
      message: "Disponibilidades",
      data,
    });
  } catch (e) {
    console.error("❌ disponibilidad-batch error:", e);
    return res.status(500).json({
      success: false,
      message: "Error interno",
      error: { message: e?.message || String(e) },
    });
  }
}

module.exports = {
  // legacy
  createCaja,
  getCajas,
  getCajaById,
  updateCaja,

  // nuevo
  createPon,
  createNap,
  addCajaSplitter,
  getCajaDisponibilidad,
  getCajaRutasDisponibles,
  getDisponibilidadBatch,
};
