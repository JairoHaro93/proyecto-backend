// src/sockets/socketHandler.js
const { poolmysql } = require("../config/db");

// 🔧 Control local de logs para ESTE archivo
const ShowConsoleLog = false; // ponlo en false para ocultar los console.log

function log(...args) {
  if (ShowConsoleLog) {
    console.log(...args);
  }
}

// 🧠 Estado en memoria de timbres
// clave: lector_codigo -> {
//   lector_codigo, online, modo_actual, usuario_enrolando_id,
//   last_ping (ms), socketId
// }
const timbresState = new Map();

// 🧠 Operaciones pendientes de eliminación de huellas (por correlationId)
const pendingDeleteOps = new Map();

// Referencia global a io para usar desde otros módulos (controladores HTTP)
let ioRef = null;

// ⏱️ Timeout de ping (20s)
const TIMBRE_TIMEOUT_MS = 20_000;
let monitorIniciado = false;

/**
 * Monitor que revisa periódicamente el último ping de cada timbre.
 * Si pasa más de TIMBRE_TIMEOUT_MS sin ping y el timbre sigue en online=true,
 * lo marca como offline y avisa al front.
 */
function iniciarMonitorTimeout(io) {
  if (monitorIniciado) return;
  monitorIniciado = true;

  setInterval(() => {
    const ahora = Date.now();

    for (const [lc, state] of timbresState.entries()) {
      // Solo nos interesa si tenemos last_ping y está marcado como online
      if (!state.last_ping || !state.online) continue;

      const diff = ahora - state.last_ping;

      if (diff > TIMBRE_TIMEOUT_MS) {
        const newState = {
          ...state,
          online: false,
        };

        timbresState.set(lc, newState);

        // 🔔 Avisamos al front SOLO cuando cambia a offline por timeout
        io.emit("timbre_estado", newState);

        log(
          `⏱️ Timbre ${lc} marcado OFFLINE por timeout de ping ` +
            `(>${TIMBRE_TIMEOUT_MS}ms, socketId=${state.socketId || "null"})`
        );
      }
    }
  }, 5_000); // revisamos cada 5 segundos
}

/**
 * Solicita al timbre (ESP32) que elimine una lista de huellas y espera respuesta.
 * @param {string} lector_codigo
 * @param {Array<{ finger_id: number, slot?: number }>} huellas
 * @returns {Promise<any>}
 */
function solicitarEliminacionHuellasEnTimbre(lector_codigo, huellas = []) {
  if (!ioRef) {
    return Promise.reject(new Error("Socket.IO no está inicializado"));
  }

  const state = timbresState.get(lector_codigo);
  if (!state || !state.online || !state.socketId) {
    return Promise.reject(
      new Error(`Timbre ${lector_codigo} no está conectado actualmente`)
    );
  }

  const socket = ioRef.sockets.sockets.get(state.socketId);
  if (!socket) {
    return Promise.reject(
      new Error(
        `Socket activo ${state.socketId} para timbre ${lector_codigo} no encontrado`
      )
    );
  }

  const correlationId = `del_${lector_codigo}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`;

  const payload = {
    lector_codigo,
    correlationId,
    huellas: huellas.map((h) => ({
      finger_id: Number(h.finger_id),
      slot: h.slot != null ? Number(h.slot) : undefined,
    })),
  };

  return new Promise((resolve, reject) => {
    const timeoutMs = 5000;
    const timeout = setTimeout(() => {
      pendingDeleteOps.delete(correlationId);
      reject(new Error("Timeout esperando respuesta del timbre"));
    }, timeoutMs);

    pendingDeleteOps.set(correlationId, { resolve, reject, timeout });

    log(`➡️ Enviando timbre_eliminar_huellas a ${lector_codigo}:`, payload);
    socket.emit("timbre_eliminar_huellas", payload);
  });
}

function setupSocket(io) {
  ioRef = io; // guardamos referencia global

  // Iniciamos el monitor de timeout una sola vez
  iniciarMonitorTimeout(io);

  io.on("connection", async (socket) => {
    const { usuario_id } = socket.handshake.query || {};
    const usuarioIdNumber = usuario_id ? Number(usuario_id) : null;

    log("🔌 Nueva conexión Socket.IO:", {
      socketId: socket.id,
      usuario_id,
    });

    // ========================================
    // 1) CONEXIONES DE USUARIO (ANGULAR / FLUTTER)
    // ========================================
    if (usuarioIdNumber) {
      try {
        const [rows] = await poolmysql.query(
          `
          SELECT 
            u.id, 
            u.nombre,
            CASE 
              WHEN EXISTS (
                SELECT 1 
                FROM sisusuarios_has_sisfunciones f 
                WHERE f.sisusuarios_id = u.id AND f.sisfunciones_id = 17
              ) THEN 1
              ELSE 0
            END AS has_agenda
          FROM sisusuarios u
          WHERE u.id = ?;
        `,
          [usuarioIdNumber]
        );

        const usuario = rows[0];

        if (!usuario) {
          console.warn("⚠️ Usuario no encontrado. Cerrando socket.");
          socket.disconnect(true);
          return;
        }

        socket.join(`usuario_${usuario.id}`);
        log(`👤 Socket ${socket.id} unido a sala usuario_${usuario.id}`);

        if (usuario.has_agenda === 1) {
          socket.join("sala_NOC");
          log(`🏢 Usuario ${usuario.id} unido a sala_NOC`);
        }
      } catch (error) {
        console.error("❌ Error al verificar usuario:", error.message);
        socket.disconnect(true);
        return;
      }
    }

    // ========================================
    // 2) TIMBRE (ESP32) – IDENTIFICACIÓN
    // ========================================
    socket.on("timbre_identificacion", (data) => {
      const lc = data?.lector_codigo;
      if (!lc) {
        console.warn("⚠️ timbre_identificacion sin lector_codigo:", data);
        socket.disconnect(true);
        return;
      }

      socket.data.lector_codigo = lc;
      socket.join(`timbre_${lc}`);

      log(`🔔 Timbre identificado vía evento: ${lc} (socket ${socket.id})`);

      const ahoraMs = Date.now();
      const prev = timbresState.get(lc) || {};

      const state = {
        lector_codigo: lc,
        online: true,
        modo_actual: prev.modo_actual || "PRODUCCION",
        usuario_enrolando_id: prev.usuario_enrolando_id || 0,
        last_ping: ahoraMs,
        socketId: socket.id,
      };

      timbresState.set(lc, state);

      // Notificar al front
      io.emit("timbre_estado", state);
    });

    // ========================================
    // 3) TIMBRE - PING (mantener estado online)
    // ========================================
    socket.on("timbre_ping", async (data) => {
      const lc =
        (data && data.lector_codigo) || socket.data?.lector_codigo || null;

      if (!lc) {
        console.warn("⚠️ timbre_ping sin lector_codigo. Payload:", data);
        return;
      }

      const ahoraMs = Date.now();
      const prev = timbresState.get(lc) || {};

      const state = {
        lector_codigo: lc,
        online: true, // si hay ping, está online
        modo_actual: prev.modo_actual || "PRODUCCION",
        usuario_enrolando_id: prev.usuario_enrolando_id || 0,
        last_ping: ahoraMs,
        socketId: socket.id,
      };

      timbresState.set(lc, state);

      log(
        "📡 timbre_ping recibido de:",
        lc,
        "->",
        new Date(ahoraMs).toISOString()
      );

      // (Opcional) actualizar last_heartbeat en BD
      try {
        await poolmysql.query(
          "UPDATE neg_t_timbres SET last_heartbeat = NOW() WHERE lector_codigo = ?",
          [lc]
        );
      } catch (err) {
        console.error(
          "❌ Error actualizando last_heartbeat de timbre",
          lc,
          ":",
          err.message
        );
      }

      io.emit("timbre_estado", state);
    });

    // ========================================
    // 4) TIMBRE - CAMBIO DE MODO (desde el front)
    // ========================================
    socket.on("timbre_set_modo", async (data) => {
      try {
        const {
          lector_codigo,
          modo_actual,
          usuario_enrolando_id = 0,
        } = data || {};

        if (!lector_codigo || !modo_actual) {
          console.warn("⚠️ timbre_set_modo sin datos suficientes:", data);
          return;
        }

        const prev = timbresState.get(lector_codigo) || {};
        const ahoraMs = Date.now();

        const state = {
          lector_codigo,
          online: prev.online ?? true, // si estamos cambiando modo, asumimos que está conectado
          modo_actual,
          usuario_enrolando_id,
          last_ping: prev.last_ping || ahoraMs,
          socketId: prev.socketId || null,
        };

        timbresState.set(lector_codigo, state);

        // Persistir en BD
        try {
          await poolmysql.query(
            `
            UPDATE neg_t_timbres
            SET modo_actual = ?, usuario_enrolando_id = ?
            WHERE lector_codigo = ?
          `,
            [modo_actual, usuario_enrolando_id, lector_codigo]
          );
        } catch (err) {
          console.error(
            "❌ Error actualizando modo_actual en neg_t_timbres:",
            err.message
          );
        }

        log(
          `🔁 Cambio de modo timbre ${lector_codigo} => ${modo_actual} (usuario_enrolando_id=${usuario_enrolando_id})`
        );

        // Avisar al ESP32
        io.to(`timbre_${lector_codigo}`).emit("timbre_modo", {
          modo_actual,
          usuario_enrolando_id,
        });

        // Avisar al front
        io.emit("timbre_estado", state);
      } catch (err) {
        console.error("❌ Error en timbre_set_modo:", err.message);
      }
    });

    // ========================================
    // 5) TIMBRE - ENROLAMIENTO COMPLETO (desde ESP32)
    // ========================================
    socket.on("timbre_enrolamiento_completo", async (data) => {
      const lc = data?.lector_codigo || socket.data?.lector_codigo;

      if (!lc) {
        console.warn(
          "⚠️ timbre_enrolamiento_completo sin lector_codigo:",
          data
        );
        return;
      }

      const prev = timbresState.get(lc) || {};
      const ahoraMs = Date.now();

      const state = {
        lector_codigo: lc,
        online: true, // si puede enviar este evento es porque sigue conectado
        modo_actual: "PRODUCCION",
        usuario_enrolando_id: 0,
        last_ping: prev.last_ping || ahoraMs,
        socketId: prev.socketId || socket.id,
      };

      timbresState.set(lc, state);

      // Actualizar BD
      try {
        await poolmysql.query(
          `
          UPDATE neg_t_timbres
          SET modo_actual = 'PRODUCCION',
              usuario_enrolando_id = 0
          WHERE lector_codigo = ?
        `,
          [lc]
        );
      } catch (err) {
        console.error(
          "❌ Error actualizando neg_t_timbres tras enrolamiento completo:",
          err.message
        );
      }

      log(`✅ Enrolamiento completo en timbre ${lc}. Volviendo a PRODUCCION`);

      // Avisar al ESP32 (por si necesita sincronizar modo)
      io.to(`timbre_${lc}`).emit("timbre_modo", {
        modo_actual: "PRODUCCION",
        usuario_enrolando_id: 0,
      });

      // Avisar al front: evento específico
      io.emit("timbre_enrolamiento_completo", { lector_codigo: lc });

      // Y refrescar estado general de ese timbre
      io.emit("timbre_estado", state);
    });

    // ========================================
    // 6) TIMBRE - RESPUESTA ELIMINACIÓN HUELLA(S)
    // ========================================
    socket.on("timbre_eliminar_huellas_resp", (data) => {
      const { correlationId } = data || {};
      if (!correlationId) {
        console.warn(
          "⚠️ timbre_eliminar_huellas_resp sin correlationId:",
          data
        );
        return;
      }

      const pending = pendingDeleteOps.get(correlationId);
      if (!pending) {
        console.warn(
          "⚠️ timbre_eliminar_huellas_resp sin operación pendiente registrada:",
          data
        );
        return;
      }

      clearTimeout(pending.timeout);
      pendingDeleteOps.delete(correlationId);

      if (data.ok) {
        pending.resolve(data);
      } else {
        pending.reject(
          new Error(
            data.message || "Error reportado por timbre al eliminar huellas"
          )
        );
      }
    });

    // ========================================
    // 7) EVENTOS EXISTENTES (SOPORTES / AGENDA)
    // ========================================
    socket.on("soporteActualizado", () => {
      log("🔄 Un soporte ha cambiado.");
      io.to("sala_NOC").emit("soporteActualizadoNOC");
    });

    socket.on("soporteCreado", () => {
      log("📢 Se creó un nuevo soporte.");
      io.to("sala_NOC").emit("soporteCreadoNOC");
    });

    socket.on("trabajoPreagendado", () => {
      log("📢 Se Preagendó un nuevo trabajo.");
      io.to("sala_NOC").emit("trabajoPreagendadoNOC");
    });

    socket.on("trabajoCulminado", ({ tecnicoId }) => {
      log("✅ Trabajo Culminado. Notificando a técnico y NOC.");
      if (tecnicoId) {
        io.to(`usuario_${tecnicoId}`).emit("trabajoCulminadoTecnico");
      }
      io.to("sala_NOC").emit("trabajoCulminadoNOC");
    });

    socket.on("trabajoAgendado", ({ tecnicoId }) => {
      log("📆 Trabajo Agendado. Notificando a técnico y NOC.");
      if (tecnicoId) {
        io.to(`usuario_${tecnicoId}`).emit("trabajoAgendadoTecnico");
      }
      io.to("sala_NOC").emit("trabajoAgendadoNOC");
    });

    // ========================================
    // 8) DESCONEXIÓN
    // ========================================
    socket.on("disconnect", async (reason) => {
      log(`❌ Cliente desconectado: ${socket.id} (reason=${reason})`);

      // ---- TIMBRE: solo marcar OFFLINE si este socket era el ACTIVO ----
      const lc = socket.data?.lector_codigo;
      if (lc) {
        const prev = timbresState.get(lc);

        if (prev && prev.socketId === socket.id) {
          const state = {
            ...prev,
            lector_codigo: lc,
            online: false,
            last_ping: Date.now(),
            socketId: null,
          };

          timbresState.set(lc, state);
          io.emit("timbre_estado", state);

          log(
            `🔕 Timbre ${lc} marcado como OFFLINE (disconnect de socket activo ${socket.id})`
          );
        } else {
          log(
            `ℹ️ Disconnect de socket antiguo ${socket.id} para timbre ${lc}, socket activo es ${prev?.socketId}. No se marca offline.`
          );
        }
      }

      // ---- USUARIO ANGULAR / FLUTTER ----
      if (usuarioIdNumber) {
        try {
          await poolmysql.query(
            `UPDATE sisusuarios SET is_logged = 0 WHERE id = ?`,
            [usuarioIdNumber]
          );
          log(`🔒 Usuario ${usuarioIdNumber} marcado como desconectado`);
        } catch (error) {
          console.error("❌ Error al actualizar is_logged:", error.message);
        }
      }
    });
  });
}

module.exports = { setupSocket, solicitarEliminacionHuellasEnTimbre };
