const http = require("http");
const app = require("./src/app");
const { connectDB } = require("./src/config/db");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV;

connectDB()
  .then(() => {
    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}/`);
      console.log(`🌎 Entorno: ${NODE_ENV}`);
    });

    server.on("error", (error) => {
      console.error("❌ Error del servidor:", error.message);
    });
  })
  .catch((err) => {
    console.error("❌ Error al iniciar la base de datos:", err.message);
    process.exit(1);
  });
