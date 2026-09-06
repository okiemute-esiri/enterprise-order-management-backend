import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Order } from "../src/domain/order-model.js";
import { RedisOrderCache } from "../src/infrastructure/redis-order-cache.js";

const describeRedis = process.env.REDIS_URL ? describe : describe.skip;

describeRedis("RedisOrderCache", () => {
  let cache: RedisOrderCache;

  beforeAll(async () => {
    cache = await RedisOrderCache.connect(process.env.REDIS_URL!, 60);
  });

  afterAll(async () => {
    await cache.close();
  });

  it("stores, reads and expires order snapshots through Redis", async () => {
    const order: Order = {
      id: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      status: "CONFIRMED",
      total: 125,
      items: [{
        productId: "00000000-0000-4000-8000-000000000003",
        quantity: 1,
        unitPrice: 125,
        lineTotal: 125
      }]
    };

    await cache.set(order);
    expect(await cache.get(order.id)).toEqual(order);
  });
});
