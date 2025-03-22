const http = require("http");
const app = require("./src/app");
const { Server } = require("socket.io");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

console.log("🚀 Servidor HTTP y WebSockets inicializándose...");

io.on("connection", (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);

  socket.on("soporteActualizado", () => {
    console.log("🔄 Un soporte ha cambiado. Notificando a todos.");
    io.emit("actualizarSoportes");
  });

  socket.on("soporteCreado", () => {
    console.log("📢 Se creó un nuevo soporte.");
    io.emit("actualizarSoportes");
  });

  socket.on("soporteResuelto", () => {
    console.log("✅ Soporte resuelto. Notificando a todos.");
    io.emit("actualizarSoportes");
  });

  socket.on("disconnect", () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Configuración del servidor:");
  console.log(` - Modo: ${NODE_ENV}`);
  console.log(` - Puerto: ${PORT}`);
});

server.on("error", (error) => {
  console.error("❌ Error del servidor:", error.message);
});
