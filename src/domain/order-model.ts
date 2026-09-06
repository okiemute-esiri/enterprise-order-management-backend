export type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "FULFILLED";

export type Customer = {
  id: string;
  name: string;
  email: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
};

export type Inventory = {
  productId: string;
  availableQuantity: number;
  reservedQuantity: number;
};

export type OrderItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
};

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "DomainError";
  }
}
