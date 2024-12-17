// Server creation and configuration
const http = require("http");
const app = require("./src/app");

// Config .env
require("dotenv").config();
const NODE_ENV = process.env.NODE_ENV;
// Server creation
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
server.listen(PORT);

// Listeners
server.on("listening", () => {
  console.log(`SERVIDOR ESCUCHANDO POR EL PUERTO ${PORT}`);
  console.log(`ENTORNO: ${NODE_ENV}`);
});

server.on("error", (error) => {
  console.log(error);
});
