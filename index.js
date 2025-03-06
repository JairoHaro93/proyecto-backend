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

  io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id);

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
      console.log("Cliente desconectado:", socket.id);
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}/`);
    console.log(`🌎 Entorno: ${NODE_ENV}`);
  });

  server.on("error", (error) => {
    console.error("❌ Error del servidor:", error.message);
  });
});
