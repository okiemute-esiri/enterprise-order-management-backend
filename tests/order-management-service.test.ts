import { describe, expect, it } from "vitest";
import { OrderManagementService } from "../src/application/order-management-service.js";
import { DomainError } from "../src/domain/order-model.js";
import { createInMemoryRepositories } from "../src/infrastructure/in-memory-repositories.js";

function createService() {
  return new OrderManagementService(createInMemoryRepositories());
}

describe("OrderManagementService", () => {
  it("rejects duplicate customer emails case-insensitively", async () => {
    const service = createService();
    await service.createCustomer({ name: "Acme Corp", email: "Ops@Acme.test" });
    await expect(service.createCustomer({ name: "Acme EU", email: "ops@acme.test" })).rejects.toBeInstanceOf(DomainError);
  });

  it("keeps an order pending when aggregate inventory is insufficient", async () => {
    const service = createService();
    const customer = await service.createCustomer({ name: "Beta Ltd", email: "beta@test.dev" });
    const product = await service.createProduct({ sku: "SKU-500", name: "Controller", unitPrice: 50 });
    await service.adjustInventory(product.id, 1);
    const order = await service.createOrder({
      customerId: customer.id,
      items: [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 1 }
      ]
    });
    await expect(service.confirmOrder(order.id)).rejects.toBeInstanceOf(DomainError);
    expect((await service.getOrder(order.id)).status).toBe("PENDING");
  });

  it("prevents invalid order state transitions after cancellation", async () => {
    const service = createService();
    const customer = await service.createCustomer({ name: "Gamma Ltd", email: "gamma@test.dev" });
    const product = await service.createProduct({ sku: "SKU-600", name: "Gateway", unitPrice: 80 });
    await service.adjustInventory(product.id, 1);
    const order = await service.createOrder({ customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] });
    await service.confirmOrder(order.id);
    expect((await service.cancelOrder(order.id)).status).toBe("CANCELLED");
    await expect(service.cancelOrder(order.id)).rejects.toBeInstanceOf(DomainError);
    await expect(service.confirmOrder(order.id)).rejects.toBeInstanceOf(DomainError);
  });

  it("rolls back inventory when order persistence fails during confirmation", async () => {
    const repositories = createInMemoryRepositories();
    const service = new OrderManagementService(repositories);
    const customer = await service.createCustomer({ name: "Delta Ltd", email: "delta@test.dev" });
    const product = await service.createProduct({ sku: "SKU-700", name: "Sensor", unitPrice: 100 });
    await service.adjustInventory(product.id, 2);
    const order = await service.createOrder({ customerId: customer.id, items: [{ productId: product.id, quantity: 2 }] });

    const saveOrder = repositories.orders.save.bind(repositories.orders);
    repositories.orders.save = async (candidate) => {
      if (candidate.status === "CONFIRMED") throw new Error("simulated persistence failure");
      await saveOrder(candidate);
    };

    await expect(service.confirmOrder(order.id)).rejects.toThrow("simulated persistence failure");
    expect((await service.getOrder(order.id)).status).toBe("PENDING");
    expect(await repositories.inventory.findByProductId(product.id)).toEqual({
      productId: product.id,
      availableQuantity: 2,
      reservedQuantity: 0
    });
  });
});
