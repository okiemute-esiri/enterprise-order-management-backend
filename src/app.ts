import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "FULFILLED";
type Customer = { id: string; name: string; email: string };
type Product = { id: string; sku: string; name: string; unitPrice: number };
type Inventory = { productId: string; availableQuantity: number; reservedQuantity: number };
type OrderItem = { productId: string; quantity: number; unitPrice: number; lineTotal: number };
type Order = { id: string; customerId: string; status: OrderStatus; items: OrderItem[]; total: number };

class DomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

const customerSchema = z.object({ name: z.string().trim().min(2), email: z.string().trim().email() });
const productSchema = z.object({ sku: z.string().trim().min(2), name: z.string().trim().min(2), unitPrice: z.number().positive() });
const inventorySchema = z.object({ quantity: z.number().int() });
const orderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1)
});

function aggregateOrderRequirements(items: OrderItem[]): Map<string, number> {
  const requiredByProduct = new Map<string, number>();
  for (const item of items) {
    requiredByProduct.set(item.productId, (requiredByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  return requiredByProduct;
}

export function createApp() {
  const customers = new Map<string, Customer>();
  const products = new Map<string, Product>();
  const inventory = new Map<string, Inventory>();
  const orders = new Map<string, Order>();
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", (_req, res) => res.json({ status: "ready" }));

  app.post("/api/v1/customers", (req, res, next) => {
    try {
      const input = customerSchema.parse(req.body);
      if ([...customers.values()].some((c) => c.email.toLowerCase() === input.email.toLowerCase())) {
        throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
      }
      const customer: Customer = { id: randomUUID(), ...input };
      customers.set(customer.id, customer);
      res.status(201).json({ data: customer });
    } catch (error) { next(error); }
  });

  app.post("/api/v1/products", (req, res, next) => {
    try {
      const input = productSchema.parse(req.body);
      if ([...products.values()].some((p) => p.sku.toLowerCase() === input.sku.toLowerCase())) {
        throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
      }
      const product: Product = { id: randomUUID(), ...input };
      products.set(product.id, product);
      inventory.set(product.id, { productId: product.id, availableQuantity: 0, reservedQuantity: 0 });
      res.status(201).json({ data: product });
    } catch (error) { next(error); }
  });

  app.post("/api/v1/inventory/:productId/adjustments", (req, res, next) => {
    try {
      const { quantity } = inventorySchema.parse(req.body);
      const record = inventory.get(req.params.productId);
      if (!record) throw new DomainError("PRODUCT_NOT_FOUND", "Product not found", 404);
      if (record.availableQuantity + quantity < 0) throw new DomainError("INVALID_INVENTORY_ADJUSTMENT", "Inventory cannot become negative", 409);
      record.availableQuantity += quantity;
      res.json({ data: record });
    } catch (error) { next(error); }
  });

  app.post("/api/v1/orders", (req, res, next) => {
    try {
      const input = orderSchema.parse(req.body);
      if (!customers.has(input.customerId)) throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
      const items = input.items.map(({ productId, quantity }) => {
        const product = products.get(productId);
        if (!product) throw new DomainError("PRODUCT_NOT_FOUND", `Product ${productId} not found`, 404);
        return { productId, quantity, unitPrice: product.unitPrice, lineTotal: product.unitPrice * quantity };
      });
      const order: Order = { id: randomUUID(), customerId: input.customerId, status: "PENDING", items, total: items.reduce((sum, item) => sum + item.lineTotal, 0) };
      orders.set(order.id, order);
      res.status(201).json({ data: order });
    } catch (error) { next(error); }
  });

  app.post("/api/v1/orders/:orderId/confirm", (req, res, next) => {
    try {
      const order = orders.get(req.params.orderId);
      if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found", 404);
      if (order.status !== "PENDING") throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);

      const requiredByProduct = aggregateOrderRequirements(order.items);
      for (const [productId, requiredQuantity] of requiredByProduct) {
        const stock = inventory.get(productId)!;
        if (stock.availableQuantity < requiredQuantity) {
          throw new DomainError("INSUFFICIENT_INVENTORY", "Requested quantity is not currently available", 409);
        }
      }

      for (const [productId, requiredQuantity] of requiredByProduct) {
        const stock = inventory.get(productId)!;
        stock.availableQuantity -= requiredQuantity;
        stock.reservedQuantity += requiredQuantity;
      }

      order.status = "CONFIRMED";
      res.json({ data: order });
    } catch (error) { next(error); }
  });

  app.post("/api/v1/orders/:orderId/cancel", (req, res, next) => {
    try {
      const order = orders.get(req.params.orderId);
      if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found", 404);
      if (order.status === "FULFILLED" || order.status === "CANCELLED") throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
      if (order.status === "CONFIRMED") {
        const requiredByProduct = aggregateOrderRequirements(order.items);
        for (const [productId, requiredQuantity] of requiredByProduct) {
          const stock = inventory.get(productId)!;
          stock.availableQuantity += requiredQuantity;
          stock.reservedQuantity -= requiredQuantity;
        }
      }
      order.status = "CANCELLED";
      res.json({ data: order });
    } catch (error) { next(error); }
  });

  app.get("/api/v1/orders/:orderId", (req, res, next) => {
    try {
      const order = orders.get(req.params.orderId);
      if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found", 404);
      res.json({ data: order });
    } catch (error) { next(error); }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues } });
    if (error instanceof DomainError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    console.error(error);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  });

  return app;
}
