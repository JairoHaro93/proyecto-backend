// src/sockets/socketHandler.js
const { poolmysql } = require("../config/db");

function setupSocket(io) {
  io.on("connection", async (socket) => {
    const usuarioId = socket.handshake.query.usuario_id;
  

    if (!usuarioId) {
      console.warn("⚠️ Conexión sin usuario_id. Cerrando socket.");
      socket.disconnect(true);
      return;
    }

    try {
      const [rows] = await poolmysql.query(
        `SELECT id, nombre, is_noc FROM sisusuarios WHERE id = ?`,
        [usuarioId]
      );

      const usuario = rows[0];

      if (!usuario) {
        console.warn("⚠️ Usuario no encontrado. Cerrando socket.");
        socket.disconnect(true);
        return;
      }

      // 👥 Agregar a sala del usuario individual
      socket.join(`usuario_${usuario.id}`);
      console.log(`👤 Socket ${socket.id} unido a sala individual usuario_${usuario.id}`);

      // 🏢 Si es NOC, unir a sala NOC
      if (usuario.is_noc === 1) {
        socket.join("sala_NOC");
        console.log(`🏢 Usuario ${usuario.id} unido a sala NOC`);
      }
    } catch (error) {
      console.error("❌ Error al verificar usuario:", error.message);
      socket.disconnect(true);
      return;
    }

 // CAMBIO ESTADO DE SOPORTE
socket.on("soporteActualizado", () => {
  console.log("🔄 Un soporte ha cambiado.");
  io.to("sala_NOC").emit("soporteActualizadoNOC");
  console.log("📡 Notificado a sala_NOC (soporteActualizadoNOC)");
});

// NUEVO SOPORTE CREADO
socket.on("soporteCreado", () => {
  console.log("📢 Se creó un nuevo soporte.");
  io.to("sala_NOC").emit("soporteCreadoNOC");
  console.log("📡 Notificado a sala_NOC (soporteCreadoNOC)");
});

// NUEVO TRABAJO A PREAGENDA
socket.on("trabajoPreagendado", () => {
  console.log("📢 Se Preagendo un nuevo trabajo.");
  io.to("sala_NOC").emit("trabajoPreagendadoNOC");
  console.log("📡 Notificado a sala_NOC (trabajoPreagendadoNOC)");
});



 // TRABAJO CULMINADO POR TÉCNICO
socket.on("trabajoCulminado", ({ tecnicoId }) => {
  console.log("✅ Trabajo Culminado. Notificando a técnico y NOC.");
  if (tecnicoId) {
    io.to(`usuario_${tecnicoId}`).emit("trabajoCulminadoTecnico");
    console.log(`📤 Notificado a usuario_${tecnicoId} (trabajoCulminadoTecnico)`);
  }
  io.to("sala_NOC").emit("trabajoCulminadoNOC");
});

// TRABAJO AGENDADO A UN TÉCNICO
socket.on("trabajoAgendado", ({ tecnicoId }) => {
  console.log("📆 Trabajo Agendado. Notificando a técnico y NOC.");
  if (tecnicoId) {
    io.to(`usuario_${tecnicoId}`).emit("trabajoAgendadoTecnico");
    console.log(`📤 Notificado a usuario_${tecnicoId} (trabajoAgendadoTecnico)`);
  }
  io.to("sala_NOC").emit("trabajoAgendadoNOC");
});




    //SOCKET DE DESCONEXION
    socket.on("disconnect", async () => {
      console.log(`❌ Cliente desconectado: ${socket.id}`);
      if (usuarioId) {
        try {
          await poolmysql.query(
            `UPDATE sisusuarios SET is_logged = 0 WHERE id = ?`,
            [usuarioId]
          );
          console.log(`🔒 Usuario ${usuarioId} marcado como desconectado`);
        } catch (error) {
          console.error("❌ Error al actualizar is_logged:", error.message);
        }
      }
    });
  });
}

module.exports = { setupSocket };
