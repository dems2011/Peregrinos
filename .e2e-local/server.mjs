// Servidor PostgreSQL local en memoria (PGlite) para E2E. Nunca toca Neon.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5441, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log("PGLITE_READY 127.0.0.1:5441");
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
