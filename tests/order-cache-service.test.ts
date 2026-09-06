import { describe, expect, it } from "vitest";
import type { OrderCache } from "../src/application/ports/order-cache.js";
import { OrderManagementService } from "../src/application/order-management-service.js";
import type { Order } from "../src/domain/order-model.js";
import { createInMemoryRepositories } from "../src/infrastructure/in-memory-repositories.js";

class MemoryOrderCache implements OrderCache {
  readonly records = new Map<string, Order>();
  async get(orderId: string): Promise<Order | null> { return this.records.get(orderId) ?? null; }
  async set(order: Order): Promise<void> { this.records.set(order.id, structuredClone(order)); }
  async close(): Promise<void> {}
}

describe("OrderManagementService cache behavior", () => {
  it("keeps cached order snapshots aligned with state transitions", async () => {
    const cache = new MemoryOrderCache();
    const service = new OrderManagementService(createInMemoryRepositories(), cache);
    const customer = await service.createCustomer({ name: "Cache Customer", email: "cache@test.dev" });
    const product = await service.createProduct({ sku: "CACHE-1", name: "Cached Sensor", unitPrice: 25 });
    await service.adjustInventory(product.id, 1);
    const order = await service.createOrder({ customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] });

    expect(cache.records.get(order.id)?.status).toBe("PENDING");
    await service.confirmOrder(order.id);
    expect(cache.records.get(order.id)?.status).toBe("CONFIRMED");
    await service.fulfillOrder(order.id);
    expect(cache.records.get(order.id)?.status).toBe("FULFILLED");
    expect((await service.getOrder(order.id)).status).toBe("FULFILLED");
  });
});
