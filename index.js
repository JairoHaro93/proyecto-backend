const http = require("http");
const app = require("./src/app");
const { Server } = require("socket.io");
const { setupSocket } = require("./src/sockets/socketHandler");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;
const IP = process.env.IP;
const IP_BACKEND = process.env.IP_BACKEND;
const RUTA_DESTINO = process.env.RUTA_DESTINO;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.IP,
    credentials: true,
  },
});

// Inicializar socket separado
setupSocket(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log("🖥 Configuración del servidor:");
  console.log(` - Modo: ${NODE_ENV}`);
  console.log(` - Puerto: ${PORT}`);
  console.log("💻 IP_FRONTEND " + IP);
  console.log("🌐 IP_BACKEND:", IP_BACKEND);
  console.log("📁 rutaDestino:", RUTA_DESTINO);
});

server.on("error", (error) => {
  console.error("❌ Error del servidor:", error.message);
});
