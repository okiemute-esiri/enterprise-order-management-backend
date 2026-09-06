import { randomUUID } from "node:crypto";
import { DomainError, type Customer, type Inventory, type Order, type Product } from "../domain/order-model.js";
import {
  RepositoryConflictError,
  type OrderManagementRepositories,
  type OrderRepositories
} from "./ports/repositories.js";

export type CreateCustomerInput = { name: string; email: string };
export type CreateProductInput = { sku: string; name: string; unitPrice: number };
export type CreateOrderInput = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
};

export class OrderManagementService {
  constructor(private readonly repositories: OrderManagementRepositories) {}

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    if (await this.repositories.customers.findByEmail(input.email)) {
      throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
    }
    const customer: Customer = { id: randomUUID(), name: input.name, email: input.email.toLowerCase() };
    try {
      await this.repositories.customers.save(customer);
    } catch (error) {
      if (error instanceof RepositoryConflictError && error.constraint === "customer_email") {
        throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
      }
      throw error;
    }
    return customer;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    if (await this.repositories.products.findBySku(input.sku)) {
      throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
    }
    const product: Product = { id: randomUUID(), ...input, sku: input.sku.toUpperCase() };
    try {
      await this.repositories.products.save(product);
    } catch (error) {
      if (error instanceof RepositoryConflictError && error.constraint === "product_sku") {
        throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
      }
      throw error;
    }
    await this.repositories.inventory.save({ productId: product.id, availableQuantity: 0, reservedQuantity: 0 });
    return product;
  }

  async adjustInventory(productId: string, quantity: number): Promise<Inventory> {
    const record = await this.repositories.inventory.findByProductId(productId);
    if (!record) throw new DomainError("PRODUCT_NOT_FOUND", "Product not found", 404);
    if (record.availableQuantity + quantity < 0) {
      throw new DomainError("INVALID_INVENTORY_ADJUSTMENT", "Inventory cannot become negative", 409);
    }
    const updated = { ...record, availableQuantity: record.availableQuantity + quantity };
    await this.repositories.inventory.save(updated);
    return updated;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (!await this.repositories.customers.findById(input.customerId)) {
      throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }

    const items = await Promise.all(input.items.map(async ({ productId, quantity }) => {
      const product = await this.repositories.products.findById(productId);
      if (!product) throw new DomainError("PRODUCT_NOT_FOUND", `Product ${productId} not found`, 404);
      return { productId, quantity, unitPrice: product.unitPrice, lineTotal: product.unitPrice * quantity };
    }));

    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      status: "PENDING",
      items,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0)
    };
    await this.repositories.orders.save(order);
    return order;
  }

  async confirmOrder(orderId: string): Promise<Order> {
    return this.repositories.transactions.run(async (repositories) => {
      const order = await this.requireOrder(repositories, orderId);
      if (order.status !== "PENDING") {
        throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);
      }

      for (const [productId, quantity] of this.aggregateQuantities(order)) {
        const reserved = await repositories.inventory.reserveAvailable(productId, quantity);
        if (!reserved) {
          throw new DomainError("INSUFFICIENT_INVENTORY", "Requested quantity is not currently available", 409);
        }
      }

      const transitioned = await repositories.orders.transitionStatus(order.id, "PENDING", "CONFIRMED");
      if (!transitioned) {
        throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);
      }

      return { ...order, status: "CONFIRMED" };
    });
  }

  async cancelOrder(orderId: string): Promise<Order> {
    return this.repositories.transactions.run(async (repositories) => {
      const order = await this.requireOrder(repositories, orderId);
      if (order.status === "FULFILLED" || order.status === "CANCELLED") {
        throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
      }

      if (order.status === "CONFIRMED") {
        for (const [productId, quantity] of this.aggregateQuantities(order)) {
          const released = await repositories.inventory.releaseReserved(productId, quantity);
          if (!released) {
            throw new DomainError("INVENTORY_INVARIANT_VIOLATION", "Reserved inventory is inconsistent with the confirmed order", 500);
          }
        }
      }

      const transitioned = await repositories.orders.transitionStatus(order.id, order.status, "CANCELLED");
      if (!transitioned) {
        throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
      }

      return { ...order, status: "CANCELLED" };
    });
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.requireOrder(this.repositories, orderId);
  }

  private async requireOrder(repositories: OrderRepositories, orderId: string): Promise<Order> {
    const order = await repositories.orders.findById(orderId);
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found", 404);
    return order;
  }

  private aggregateQuantities(order: Order): Map<string, number> {
    const quantities = new Map<string, number>();
    for (const item of order.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    return quantities;
  }
}
