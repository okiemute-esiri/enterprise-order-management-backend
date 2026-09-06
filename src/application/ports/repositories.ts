import type { Customer, Inventory, Order, Product } from "../../domain/order-model.js";

export interface CustomerRepository {
  findById(id: string): Customer | null;
  findByEmail(email: string): Customer | null;
  save(customer: Customer): void;
}

export interface ProductRepository {
  findById(id: string): Product | null;
  findBySku(sku: string): Product | null;
  save(product: Product): void;
}

export interface InventoryRepository {
  findByProductId(productId: string): Inventory | null;
  save(inventory: Inventory): void;
}

export interface OrderRepository {
  findById(id: string): Order | null;
  save(order: Order): void;
}

export interface TransactionManager {
  run<T>(operation: () => T): T;
}

export type OrderManagementRepositories = {
  customers: CustomerRepository;
  products: ProductRepository;
  inventory: InventoryRepository;
  orders: OrderRepository;
  transactions: TransactionManager;
};
