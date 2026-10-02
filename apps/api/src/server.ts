import { buildApp } from "./app";
import { cfg } from "./config";
import { prisma } from "./lib/prisma";

async function main() {
  const app = await buildApp();
  const close = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
