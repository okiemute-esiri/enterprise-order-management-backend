import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("enterprise order workflow", () => {
  it("creates customer/product, stocks inventory, creates and confirms an order", async () => {
    const app = createApp();
    const customer = await request(app).post("/api/v1/customers").send({ name: "Acme Corp", email: "ops@acme.test" });
    const product = await request(app).post("/api/v1/products").send({ sku: "SKU-100", name: "Industrial Sensor", unitPrice: 125 });

    const customerId = customer.body.data.id as string;
    const productId = product.body.data.id as string;

    await request(app).post(`/api/v1/inventory/${productId}/adjustments`).send({ quantity: 10 }).expect(200);
    const created = await request(app).post("/api/v1/orders").send({ customerId, items: [{ productId, quantity: 2 }] }).expect(201);
    expect(created.body.data.total).toBe(250);

    const confirmed = await request(app).post(`/api/v1/orders/${created.body.data.id}/confirm`).expect(200);
    expect(confirmed.body.data.status).toBe("CONFIRMED");
  });

  it("rejects confirmation when inventory is insufficient", async () => {
    const app = createApp();
    const customer = await request(app).post("/api/v1/customers").send({ name: "Beta Ltd", email: "beta@test.dev" });
    const product = await request(app).post("/api/v1/products").send({ sku: "SKU-200", name: "Controller", unitPrice: 50 });
    const created = await request(app).post("/api/v1/orders").send({ customerId: customer.body.data.id, items: [{ productId: product.body.data.id, quantity: 1 }] });

    const response = await request(app).post(`/api/v1/orders/${created.body.data.id}/confirm`).expect(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_INVENTORY");
  });

  it("rejects duplicate product lines when their aggregate quantity exceeds inventory", async () => {
    const app = createApp();
    const customer = await request(app).post("/api/v1/customers").send({ name: "Delta Ltd", email: "delta@test.dev" });
    const product = await request(app).post("/api/v1/products").send({ sku: "SKU-250", name: "Relay", unitPrice: 25 });
    const productId = product.body.data.id as string;

    await request(app).post(`/api/v1/inventory/${productId}/adjustments`).send({ quantity: 3 }).expect(200);
    const created = await request(app)
      .post("/api/v1/orders")
      .send({
        customerId: customer.body.data.id,
        items: [
          { productId, quantity: 2 },
          { productId, quantity: 2 }
        ]
      })
      .expect(201);

    const response = await request(app).post(`/api/v1/orders/${created.body.data.id}/confirm`).expect(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_INVENTORY");

    const order = await request(app).get(`/api/v1/orders/${created.body.data.id}`).expect(200);
    expect(order.body.data.status).toBe("PENDING");
  });

  it("restores reserved inventory when a confirmed order is cancelled", async () => {
    const app = createApp();
    const customer = await request(app).post("/api/v1/customers").send({ name: "Gamma Ltd", email: "gamma@test.dev" });
    const product = await request(app).post("/api/v1/products").send({ sku: "SKU-300", name: "Gateway", unitPrice: 80 });
    const productId = product.body.data.id as string;
    await request(app).post(`/api/v1/inventory/${productId}/adjustments`).send({ quantity: 1 });
    const created = await request(app).post("/api/v1/orders").send({ customerId: customer.body.data.id, items: [{ productId, quantity: 1 }] });
    await request(app).post(`/api/v1/orders/${created.body.data.id}/confirm`).expect(200);
    const cancelled = await request(app).post(`/api/v1/orders/${created.body.data.id}/cancel`).expect(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
  });
});
