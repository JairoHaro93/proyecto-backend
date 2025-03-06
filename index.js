const http = require("http");
const app = require("./src/app");
const { connectDB } = require("./src/config/db");
const { Server } = require("socket.io");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;

connectDB().then(() => {
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  console.log("🚀 Servidor HTTP y WebSockets inicializándose...");

  // Mostrar información sobre la configuración del servidor y Socket.IO
  console.log("🌐 Configuración del servidor:");
  console.log(` - Modo: ${NODE_ENV}`);
  console.log(` - Puerto: ${PORT}`);

  io.on("connection", (socket) => {
    console.log(
      `✅ Cliente conectado: ${socket.id} desde ${socket.handshake.address}`
    );

    // Escuchar evento de actualización de soportes desde el cliente
    socket.on("soporteActualizado", () => {
      console.log(
        "🔄 Un soporte ha cambiado, notificando a todos los clientes."
      );
      io.emit("actualizarSoportes"); // Notificar a todos los clientes conectados
    });

    // Cuando se crea un nuevo soporte, notificar a todos los clientes
    socket.on("soporteCreado", () => {
      console.log(
        "📢 Se creó un nuevo soporte. Notificando a todos los clientes."
      );
      io.emit("actualizarSoportes"); // Enviar actualización a todos
    });

    // Escuchar cuando un soporte cambia de estado
    socket.on("soporteResuelto", () => {
      console.log(
        "✅ Se ha cambiado el estado de un soporte. Notificando a todos los clientes..."
      );
      io.emit("actualizarSoportes"); // Notificar a todos los clientes
    });

    socket.on("disconnect", () => {
      console.log(`❌ Cliente desconectado: ${socket.id}`);
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor corriendo en http://192.168.0.180:${PORT}/`);
    console.log(`🌎 Entorno: ${NODE_ENV}`);
    console.log(`📡 WebSocket activo en ws://192.168.0.180:${PORT}`);
  });

  server.on("error", (error) => {
    console.error("❌ Error del servidor:", error.message);
  });
});
