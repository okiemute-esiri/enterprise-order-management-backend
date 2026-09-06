import { randomUUID } from "node:crypto";
import {
  DomainError,
  type Customer,
  type Inventory,
  type Order,
  type Product
} from "../domain/order-model.js";

export type CreateCustomerInput = { name: string; email: string };
export type CreateProductInput = { sku: string; name: string; unitPrice: number };
export type CreateOrderInput = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
};

export class OrderManagementService {
  private readonly customers = new Map<string, Customer>();
  private readonly products = new Map<string, Product>();
  private readonly inventory = new Map<string, Inventory>();
  private readonly orders = new Map<string, Order>();

  createCustomer(input: CreateCustomerInput): Customer {
    if ([...this.customers.values()].some((customer) => customer.email.toLowerCase() === input.email.toLowerCase())) {
      throw new DomainError("CUSTOMER_EMAIL_CONFLICT", "Customer email already exists", 409);
    }

    const customer: Customer = { id: randomUUID(), ...input };
    this.customers.set(customer.id, customer);
    return customer;
  }

  createProduct(input: CreateProductInput): Product {
    if ([...this.products.values()].some((product) => product.sku.toLowerCase() === input.sku.toLowerCase())) {
      throw new DomainError("SKU_CONFLICT", "Product SKU already exists", 409);
    }

    const product: Product = { id: randomUUID(), ...input };
    this.products.set(product.id, product);
    this.inventory.set(product.id, {
      productId: product.id,
      availableQuantity: 0,
      reservedQuantity: 0
    });
    return product;
  }

  adjustInventory(productId: string, quantity: number): Inventory {
    const record = this.inventory.get(productId);
    if (!record) throw new DomainError("PRODUCT_NOT_FOUND", "Product not found", 404);
    if (record.availableQuantity + quantity < 0) {
      throw new DomainError("INVALID_INVENTORY_ADJUSTMENT", "Inventory cannot become negative", 409);
    }

    record.availableQuantity += quantity;
    return record;
  }

  createOrder(input: CreateOrderInput): Order {
    if (!this.customers.has(input.customerId)) {
      throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }

    const items = input.items.map(({ productId, quantity }) => {
      const product = this.products.get(productId);
      if (!product) throw new DomainError("PRODUCT_NOT_FOUND", `Product ${productId} not found`, 404);
      return {
        productId,
        quantity,
        unitPrice: product.unitPrice,
        lineTotal: product.unitPrice * quantity
      };
    });

    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      status: "PENDING",
      items,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0)
    };

    this.orders.set(order.id, order);
    return order;
  }

  confirmOrder(orderId: string): Order {
    const order = this.requireOrder(orderId);
    if (order.status !== "PENDING") {
      throw new DomainError("INVALID_ORDER_STATE", "Only pending orders can be confirmed", 409);
    }

    const requiredByProduct = this.aggregateQuantities(order);
    for (const [productId, quantity] of requiredByProduct) {
      const stock = this.inventory.get(productId);
      if (!stock || stock.availableQuantity < quantity) {
        throw new DomainError("INSUFFICIENT_INVENTORY", "Requested quantity is not currently available", 409);
      }
    }

    for (const [productId, quantity] of requiredByProduct) {
      const stock = this.inventory.get(productId)!;
      stock.availableQuantity -= quantity;
      stock.reservedQuantity += quantity;
    }

    order.status = "CONFIRMED";
    return order;
  }

  cancelOrder(orderId: string): Order {
    const order = this.requireOrder(orderId);
    if (order.status === "FULFILLED" || order.status === "CANCELLED") {
      throw new DomainError("INVALID_ORDER_STATE", "Order cannot be cancelled from its current state", 409);
    }

    if (order.status === "CONFIRMED") {
      for (const [productId, quantity] of this.aggregateQuantities(order)) {
        const stock = this.inventory.get(productId)!;
        stock.availableQuantity += quantity;
        stock.reservedQuantity -= quantity;
      }
    }

    order.status = "CANCELLED";
    return order;
  }

  getOrder(orderId: string): Order {
    return this.requireOrder(orderId);
  }

  private requireOrder(orderId: string): Order {
    const order = this.orders.get(orderId);
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
