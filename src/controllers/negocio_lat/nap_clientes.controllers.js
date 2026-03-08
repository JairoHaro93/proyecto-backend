const {
  normalizeOnu,
  lookupServiciosControl,
  getAsignacionActualByOrdIns,
  getAsignacionActualByOnu,
  createAsignacion,
  liberarAsignacionById,
  liberarAsignacionByOrdIns,
  listHistorial,
} = require("../../models/negocio_lat/nap_clientes.model");

function getActorUserId(req) {
  const raw =
    req?.user?.id ??
    req?.usuario?.id ??
    req?.auth?.id ??
    req?.decoded?.id ??
    req?.id ??
    req?.body?.actorUserId ??
    null;

  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  return res.status(status).json({
    ok: false,
    error: {
      message: err?.message || "Error interno",
      code: err?.code || null,
      data: err?.data || null,
    },
  });
}

async function lookupServiciosControlHandler(req, res) {
  try {
    const ordInsList = Array.isArray(req.body?.ord_ins_list)
      ? req.body.ord_ins_list
      : [];
    const onuList = Array.isArray(req.body?.onu_list) ? req.body.onu_list : [];

    const items = await lookupServiciosControl({ ordInsList, onuList });

    return res.json({
      ok: true,
      items,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

async function getAsignacionActualByOrdInsHandler(req, res) {
  try {
    const ordIns = Number(req.params?.ordIns);
    if (!Number.isFinite(ordIns) || ordIns <= 0) {
      return res.status(400).json({
        ok: false,
        error: { message: "ordIns inválido" },
      });
    }

    const data = await getAsignacionActualByOrdIns(ordIns);

    return res.json({
      ok: true,
      data: data || null,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

async function getAsignacionActualByOnuHandler(req, res) {
  try {
    const onu = normalizeOnu(req.params?.onu || "");
    if (!onu) {
      return res.status(400).json({
        ok: false,
        error: { message: "onu inválida" },
      });
    }

    const data = await getAsignacionActualByOnu(onu);

    return res.json({
      ok: true,
      data: data || null,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

async function createAsignacionHandler(req, res) {
  try {
    const actorUserId = getActorUserId(req);

    //console.log("[nap_clientes] createAsignacion body:", req.body);
    //console.log("[nap_clientes] actorUserId:", actorUserId);

    const data = await createAsignacion({
      napId: req.body?.nap_id,
      puerto: req.body?.puerto ?? null,
      ordIns: req.body?.ord_ins,
      onu: req.body?.onu,
      observacion: req.body?.observacion ?? null,
      actorUserId,
    });

    return res.status(201).json({
      ok: true,
      message: "Asignación creada correctamente",
      data,
    });
  } catch (err) {
    console.error("[nap_clientes] createAsignacion error:", {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      data: err?.data,
      stack: err?.stack,
    });

    return sendError(res, err);
  }
}

async function liberarAsignacionByIdHandler(req, res) {
  try {
    const actorUserId = getActorUserId(req);

    const data = await liberarAsignacionById(req.params?.id, {
      motivo: req.body?.motivo ?? null,
      observacion: req.body?.observacion ?? null,
      actorUserId,
    });

    return res.json({
      ok: true,
      message: "Asignación liberada correctamente",
      data: {
        id: data.id,
        ord_ins: data.ord_ins,
        onu: data.onu,
        nap_id: data.nap_id,
        puerto: data.puerto,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
}

async function liberarAsignacionByOrdInsHandler(req, res) {
  try {
    const actorUserId = getActorUserId(req);

    const data = await liberarAsignacionByOrdIns(req.params?.ordIns, {
      motivo: req.body?.motivo ?? null,
      observacion: req.body?.observacion ?? null,
      actorUserId,
    });

    return res.json({
      ok: true,
      message: "Asignación liberada correctamente",
      data: {
        id: data.id,
        ord_ins: data.ord_ins,
        onu: data.onu,
        nap_id: data.nap_id,
        puerto: data.puerto,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
}

async function getHistorialHandler(req, res) {
  try {
    const items = await listHistorial({
      ordIns: req.query?.ord_ins ?? null,
      onu: req.query?.onu ?? null,
      napId: req.query?.nap_id ?? null,
      limit: req.query?.limit ?? 200,
    });

    return res.json({
      ok: true,
      items,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  lookupServiciosControl: lookupServiciosControlHandler,
  getAsignacionActualByOrdIns: getAsignacionActualByOrdInsHandler,
  getAsignacionActualByOnu: getAsignacionActualByOnuHandler,
  createAsignacion: createAsignacionHandler,
  liberarAsignacionById: liberarAsignacionByIdHandler,
  liberarAsignacionByOrdIns: liberarAsignacionByOrdInsHandler,
  getHistorial: getHistorialHandler,
};
