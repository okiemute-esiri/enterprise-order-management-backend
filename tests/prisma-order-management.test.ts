import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OrderManagementService } from "../src/application/order-management-service.js";
import { createPrismaRepositories } from "../src/infrastructure/prisma-repositories.js";
import { prisma } from "../src/infrastructure/prisma.js";

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;

describePostgres("Prisma order-management persistence", () => {
  const service = new OrderManagementService(createPrismaRepositories(prisma));

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists order confirmation and inventory reservation atomically", async () => {
    const customer = await service.createCustomer({ name: "Postgres Acme", email: "pg-acme@test.dev" });
    const product = await service.createProduct({ sku: "PG-100", name: "Industrial Sensor", unitPrice: 125 });
    await service.adjustInventory(product.id, 5);
    const order = await service.createOrder({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }]
    });

    const confirmed = await service.confirmOrder(order.id);
    expect(confirmed.status).toBe("CONFIRMED");

    const persistedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const persistedInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(persistedOrder?.status).toBe("CONFIRMED");
    expect(persistedInventory).toMatchObject({ availableQuantity: 3, reservedQuantity: 2 });
  });

  it("restores reserved inventory when a confirmed order is cancelled", async () => {
    const customer = await service.createCustomer({ name: "Postgres Beta", email: "pg-beta@test.dev" });
    const product = await service.createProduct({ sku: "PG-200", name: "Gateway", unitPrice: 80 });
    await service.adjustInventory(product.id, 1);
    const order = await service.createOrder({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }]
    });

    await service.confirmOrder(order.id);
    const cancelled = await service.cancelOrder(order.id);
    expect(cancelled.status).toBe("CANCELLED");

    const persistedInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(persistedInventory).toMatchObject({ availableQuantity: 1, reservedQuantity: 0 });
  });

  it("consumes reserved inventory when an order is fulfilled", async () => {
    const customer = await service.createCustomer({ name: "Postgres Fulfil", email: "pg-fulfil@test.dev" });
    const product = await service.createProduct({ sku: "PG-250", name: "Actuator", unitPrice: 90 });
    await service.adjustInventory(product.id, 4);
    const order = await service.createOrder({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 3 }]
    });

    await service.confirmOrder(order.id);
    const fulfilled = await service.fulfillOrder(order.id);
    expect(fulfilled.status).toBe("FULFILLED");

    const persistedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const persistedInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(persistedOrder?.status).toBe("FULFILLED");
    expect(persistedInventory).toMatchObject({ availableQuantity: 1, reservedQuantity: 0 });
  });

  it("allows only one concurrent confirmation when stock cannot satisfy both orders", async () => {
    const customer = await service.createCustomer({ name: "Postgres Concurrent", email: "pg-concurrent@test.dev" });
    const product = await service.createProduct({ sku: "PG-300", name: "Controller", unitPrice: 60 });
    await service.adjustInventory(product.id, 3);

    const firstOrder = await service.createOrder({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }]
    });
    const secondOrder = await service.createOrder({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }]
    });

    const results = await Promise.allSettled([
      service.confirmOrder(firstOrder.id),
      service.confirmOrder(secondOrder.id)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(inventory).toMatchObject({ availableQuantity: 1, reservedQuantity: 2 });

    const orders = await prisma.order.findMany({
      where: { id: { in: [firstOrder.id, secondOrder.id] } },
      orderBy: { id: "asc" }
    });
    expect(orders.filter((order) => order.status === "CONFIRMED")).toHaveLength(1);
    expect(orders.filter((order) => order.status === "PENDING")).toHaveLength(1);
  });
});
