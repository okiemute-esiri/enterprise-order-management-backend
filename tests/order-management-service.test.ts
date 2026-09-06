import { describe, expect, it } from "vitest";
import { OrderManagementService } from "../src/application/order-management-service.js";
import { DomainError } from "../src/domain/order-model.js";
import { createInMemoryRepositories } from "../src/infrastructure/in-memory-repositories.js";

function createService() {
  return new OrderManagementService(createInMemoryRepositories());
}

describe("OrderManagementService", () => {
  it("rejects duplicate customer emails case-insensitively", () => {
    const service = createService();
    service.createCustomer({ name: "Acme Corp", email: "Ops@Acme.test" });
    expect(() => service.createCustomer({ name: "Acme EU", email: "ops@acme.test" })).toThrowError(DomainError);
  });

  it("keeps an order pending when aggregate inventory is insufficient", () => {
    const service = createService();
    const customer = service.createCustomer({ name: "Beta Ltd", email: "beta@test.dev" });
    const product = service.createProduct({ sku: "SKU-500", name: "Controller", unitPrice: 50 });
    service.adjustInventory(product.id, 1);
    const order = service.createOrder({
      customerId: customer.id,
      items: [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 1 }
      ]
    });
    expect(() => service.confirmOrder(order.id)).toThrowError(DomainError);
    expect(service.getOrder(order.id).status).toBe("PENDING");
  });

  it("prevents invalid order state transitions after cancellation", () => {
    const service = createService();
    const customer = service.createCustomer({ name: "Gamma Ltd", email: "gamma@test.dev" });
    const product = service.createProduct({ sku: "SKU-600", name: "Gateway", unitPrice: 80 });
    service.adjustInventory(product.id, 1);
    const order = service.createOrder({ customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] });
    service.confirmOrder(order.id);
    expect(service.cancelOrder(order.id).status).toBe("CANCELLED");
    expect(() => service.cancelOrder(order.id)).toThrowError(DomainError);
    expect(() => service.confirmOrder(order.id)).toThrowError(DomainError);
  });

  it("rolls back inventory when order persistence fails during confirmation", () => {
    const repositories = createInMemoryRepositories();
    const service = new OrderManagementService(repositories);
    const customer = service.createCustomer({ name: "Delta Ltd", email: "delta@test.dev" });
    const product = service.createProduct({ sku: "SKU-700", name: "Sensor", unitPrice: 100 });
    service.adjustInventory(product.id, 2);
    const order = service.createOrder({ customerId: customer.id, items: [{ productId: product.id, quantity: 2 }] });

    const saveOrder = repositories.orders.save.bind(repositories.orders);
    repositories.orders.save = (candidate) => {
      if (candidate.status === "CONFIRMED") throw new Error("simulated persistence failure");
      saveOrder(candidate);
    };

    expect(() => service.confirmOrder(order.id)).toThrow("simulated persistence failure");
    expect(service.getOrder(order.id).status).toBe("PENDING");
    expect(repositories.inventory.findByProductId(product.id)).toEqual({
      productId: product.id,
      availableQuantity: 2,
      reservedQuantity: 0
    });
  });
});
