import { randomUUID } from "node:crypto";
import { DomainError, type Customer, type Inventory, type Order, type Product } from "../domain/order-model.js";
import type { OrderManagementRepositories } from "./ports/repositories.js";

export type CreateCustomerInput = { name: string; email: string };
export type CreateProductInput = { sku: string; name: string; unitPrice: number };
export type CreateOrderInput = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
};

export class OrderManagementService {
  constructor(private readonly repositories: OrderManagementRepositories) {}

  createCustomer(input: CreateCustomerInput): Customer {
    if (this.repositories.customers.findByEmail(input.email)) {
      throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
    }
    const customer: Customer = { id: randomUUID(), ...input };
    this.repositories.customers.save(customer);
    return customer;
  }

  createProduct(input: CreateProductInput): Product {
    if (this.repositories.products.findBySku(input.sku)) {
      throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
    }
    const product: Product = { id: randomUUID(), ...input };
    this.repositories.products.save(product);
    this.repositories.inventory.save({ productId: product.id, availableQuantity: 0, reservedQuantity: 0 });
    return product;
  }

  adjustInventory(productId: string, quantity: number): Inventory {
    const record = this.repositories.inventory.findByProductId(productId);
    if (!record) throw new DomainError("PRODUCT_NOT_FOUND", "Product not found", 404);
    if (record.availableQuantity + quantity < 0) {
      throw new DomainError("INVALID_INVENTORY_ADJUSTMENT", "Inventory cannot become negative", 409);
    }
    const updated = { ...record, availableQuantity: record.availableQuantity + quantity };
    this.repositories.inventory.save(updated);
    return updated;
  }

  createOrder(input: CreateOrderInput): Order {
    if (!this.repositories.customers.findById(input.customerId)) {
      throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }
    const items = input.items.map(({ productId, quantity }) => {
      const product = this.repositories.products.findById(productId);
      if (!product) throw new DomainError("PRODUCT_NOT_FOUND", `Product ${productId} not found`, 404);
      return { productId, quantity, unitPrice: product.unitPrice, lineTotal: product.unitPrice * quantity };
    });
    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      status: "PENDING",
      items,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0)
    };
    this.repositories.orders.save(order);
    return order;
  }

  confirmOrder(orderId: string): Order {
    return this.repositories.transactions.run(() => {
      const order = this.requireOrder(orderId);
      if (order.status !== "PENDING") {
        throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);
      }

      const requiredByProduct = this.aggregateQuantities(order);
      for (const [productId, quantity] of requiredByProduct) {
        const stock = this.repositories.inventory.findByProductId(productId);
        if (!stock || stock.availableQuantity < quantity) {
          throw new DomainError("INSUFFICIENT_INVENTORY", "Requested quantity is not currently available", 409);
        }
      }

      for (const [productId, quantity] of requiredByProduct) {
        const stock = this.repositories.inventory.findByProductId(productId)!;
        this.repositories.inventory.save({
          ...stock,
          availableQuantity: stock.availableQuantity - quantity,
          reservedQuantity: stock.reservedQuantity + quantity
        });
      }

      const confirmed: Order = { ...order, status: "CONFIRMED" };
      this.repositories.orders.save(confirmed);
      return confirmed;
    });
  }

  cancelOrder(orderId: string): Order {
    return this.repositories.transactions.run(() => {
      const order = this.requireOrder(orderId);
      if (order.status === "FULFILLED" || order.status === "CANCELLED") {
        throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
      }

      if (order.status === "CONFIRMED") {
        for (const [productId, quantity] of this.aggregateQuantities(order)) {
          const stock = this.repositories.inventory.findByProductId(productId)!;
          this.repositories.inventory.save({
            ...stock,
            availableQuantity: stock.availableQuantity + quantity,
            reservedQuantity: stock.reservedQuantity - quantity
          });
        }
      }

      const cancelled: Order = { ...order, status: "CANCELLED" };
      this.repositories.orders.save(cancelled);
      return cancelled;
    });
  }

  getOrder(orderId: string): Order {
    return this.requireOrder(orderId);
  }

  private requireOrder(orderId: string): Order {
    const order = this.repositories.orders.findById(orderId);
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
