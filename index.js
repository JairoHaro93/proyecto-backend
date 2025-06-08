const http = require("http");
const app = require("./src/app");
const { Server } = require("socket.io");
const { setupSocket } = require("./src/sockets/socketHandler");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.IP, // Usa el mismo dominio que el frontend
    // origin: "*", // Usa el mismo dominio que el frontend
    credentials: true,
  },
});

console.log("La ip en index es " + process.env.IP);

// Inicializar socket separado
setupSocket(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Configuración del servidor:");
  console.log(` - Modo: ${NODE_ENV}`);
  console.log(` - Puerto: ${PORT}`);
});

server.on("error", (error) => {
  console.error("❌ Error del servidor:", error.message);
});
