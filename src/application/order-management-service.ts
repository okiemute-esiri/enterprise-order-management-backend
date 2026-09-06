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

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    if (await this.repositories.customers.findByEmail(input.email)) {
      throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
    }
    const customer: Customer = { id: randomUUID(), ...input };
    await this.repositories.customers.save(customer);
    return customer;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    if (await this.repositories.products.findBySku(input.sku)) {
      throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
    }
    const product: Product = { id: randomUUID(), ...input };
    await this.repositories.products.save(product);
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
    return this.repositories.transactions.run(async () => {
      const order = await this.requireOrder(orderId);
      if (order.status !== "PENDING") {
        throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);
      }

      const requiredByProduct = this.aggregateQuantities(order);
      for (const [productId, quantity] of requiredByProduct) {
        const stock = await this.repositories.inventory.findByProductId(productId);
        if (!stock || stock.availableQuantity < quantity) {
          throw new DomainError("INSUFFICIENT_INVENTORY", "Requested quantity is not currently available", 409);
        }
      }

      for (const [productId, quantity] of requiredByProduct) {
        const stock = await this.repositories.inventory.findByProductId(productId);
        if (!stock) throw new DomainError("PRODUCT_NOT_FOUND", "Product inventory not found", 404);
        await this.repositories.inventory.save({
          ...stock,
          availableQuantity: stock.availableQuantity - quantity,
          reservedQuantity: stock.reservedQuantity + quantity
        });
      }

      const confirmed: Order = { ...order, status: "CONFIRMED" };
      await this.repositories.orders.save(confirmed);
      return confirmed;
    });
  }

  async cancelOrder(orderId: string): Promise<Order> {
    return this.repositories.transactions.run(async () => {
      const order = await this.requireOrder(orderId);
      if (order.status === "FULFILLED" || order.status === "CANCELLED") {
        throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
      }

      if (order.status === "CONFIRMED") {
        for (const [productId, quantity] of this.aggregateQuantities(order)) {
          const stock = await this.repositories.inventory.findByProductId(productId);
          if (!stock) throw new DomainError("PRODUCT_NOT_FOUND", "Product inventory not found", 404);
          await this.repositories.inventory.save({
            ...stock,
            availableQuantity: stock.availableQuantity + quantity,
            reservedQuantity: stock.reservedQuantity - quantity
          });
        }
      }

      const cancelled: Order = { ...order, status: "CANCELLED" };
      await this.repositories.orders.save(cancelled);
      return cancelled;
    });
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.requireOrder(orderId);
  }

  private async requireOrder(orderId: string): Promise<Order> {
    const order = await this.repositories.orders.findById(orderId);
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
