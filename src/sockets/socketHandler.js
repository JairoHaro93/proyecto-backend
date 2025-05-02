// src/sockets/socketHandler.js
const { poolmysql } = require("../config/db");

function setupSocket(io) {
  io.on("connection", (socket) => {
    const usuarioId = socket.handshake.query.usuario_id;
    console.log(`✅ Cliente conectado: ${socket.id}, usuario_id: ${usuarioId}`);

    socket.on("soporteActualizado", () => {
      console.log("🔄 Un soporte ha cambiado. Notificando a todos.");
      io.emit("actualizarSoportes");
    });

    socket.on("soporteCreado", () => {
      console.log("📢 Se creó un nuevo soporte.");
      io.emit("actualizarSoportes");
    });

    socket.on("trabajoAgendado", () => {
      console.log("✅ Trabajo Agendado. Notificando a todos.");
      io.emit("trabajoAgendado");
    });

    socket.on("soporteResuelto", () => {
      console.log("✅ Soporte resuelto. Notificando a todos.");
      io.emit("actualizarSoportes");
    });

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
