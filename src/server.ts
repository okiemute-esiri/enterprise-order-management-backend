import { noopOrderCache, type OrderCache } from "./application/ports/order-cache.js";
import { OrderManagementService } from "./application/order-management-service.js";
import { createApp } from "./app.js";
import { createInMemoryRepositories } from "./infrastructure/in-memory-repositories.js";
import { createPrismaRepositories } from "./infrastructure/prisma-repositories.js";
import { prisma } from "./infrastructure/prisma.js";
import { RedisOrderCache } from "./infrastructure/redis-order-cache.js";

const port = Number(process.env.PORT ?? 3000);
const usePostgres = Boolean(process.env.DATABASE_URL);
const redisUrl = process.env.REDIS_URL;
const redisTtlSeconds = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 30);
const repositories = usePostgres ? createPrismaRepositories(prisma) : createInMemoryRepositories();

async function createOrderCache(): Promise<OrderCache> {
  if (!redisUrl) return noopOrderCache;
  try {
    return await RedisOrderCache.connect(redisUrl, redisTtlSeconds);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "redis_connection_failed",
      message: error instanceof Error ? error.message : "Unknown Redis connection error"
    }));
    return noopOrderCache;
  }
}

const orderCache = await createOrderCache();
const service = new OrderManagementService(repositories, orderCache);
const server = createApp(service).listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "server_started",
    port,
    persistence: usePostgres ? "postgresql" : "in-memory",
    redis: Boolean(redisUrl)
  }));
});

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await orderCache.close();
  if (usePostgres) await prisma.$disconnect();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "shutdown_failed",
          message: error instanceof Error ? error.message : "Unknown shutdown error"
        }));
        process.exit(1);
      });
  });
}
