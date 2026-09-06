import { OrderManagementService } from "./application/order-management-service.js";
import { createApp } from "./app.js";
import { createInMemoryRepositories } from "./infrastructure/in-memory-repositories.js";
import { createPrismaRepositories } from "./infrastructure/prisma-repositories.js";
import { prisma } from "./infrastructure/prisma.js";

const port = Number(process.env.PORT ?? 3000);
const usePostgres = Boolean(process.env.DATABASE_URL);
const repositories = usePostgres ? createPrismaRepositories(prisma) : createInMemoryRepositories();
const service = new OrderManagementService(repositories);
const server = createApp(service).listen(port, () => {
  console.log(`enterprise-order-management-backend listening on ${port} (${usePostgres ? "postgresql" : "in-memory"})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (usePostgres) await prisma.$disconnect();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}
