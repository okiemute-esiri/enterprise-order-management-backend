import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { OrderManagementService } from "./application/order-management-service.js";
import { DomainError } from "./domain/order-model.js";
import { createInMemoryRepositories } from "./infrastructure/in-memory-repositories.js";

const customerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email()
});

const productSchema = z.object({
  sku: z.string().trim().min(2),
  name: z.string().trim().min(2),
  unitPrice: z.number().positive()
});

const inventorySchema = z.object({ quantity: z.number().int() });

const orderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive()
  })).min(1)
});

function createDefaultService() {
  return new OrderManagementService(createInMemoryRepositories());
}

export function createApp(service: OrderManagementService = createDefaultService()) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", (_req, res) => res.json({ status: "ready" }));

  app.post("/api/v1/customers", (req, res, next) => {
    try {
      const input = customerSchema.parse(req.body);
      res.status(201).json({ data: service.createCustomer(input) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/products", (req, res, next) => {
    try {
      const input = productSchema.parse(req.body);
      res.status(201).json({ data: service.createProduct(input) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/inventory/:productId/adjustments", (req, res, next) => {
    try {
      const { quantity } = inventorySchema.parse(req.body);
      res.json({ data: service.adjustInventory(req.params.productId, quantity) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/orders", (req, res, next) => {
    try {
      const input = orderSchema.parse(req.body);
      res.status(201).json({ data: service.createOrder(input) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/orders/:orderId/confirm", (req, res, next) => {
    try {
      res.json({ data: service.confirmOrder(req.params.orderId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/orders/:orderId/cancel", (req, res, next) => {
    try {
      res.json({ data: service.cancelOrder(req.params.orderId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/orders/:orderId", (req, res, next) => {
    try {
      res.json({ data: service.getOrder(req.params.orderId) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues
        }
      });
    }

    if (error instanceof DomainError) {
      return res.status(error.status).json({
        error: { code: error.code, message: error.message }
      });
    }

    console.error(error);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" }
    });
  });

  return app;
}
