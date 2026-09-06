import type { Customer, Inventory, Order, Product } from "../../domain/order-model.js";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  save(product: Product): Promise<void>;
}

export interface InventoryRepository {
  findByProductId(productId: string): Promise<Inventory | null>;
  save(inventory: Inventory): Promise<void>;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export type OrderRepositories = {
  customers: CustomerRepository;
  products: ProductRepository;
  inventory: InventoryRepository;
  orders: OrderRepository;
};

export interface TransactionManager {
  run<T>(operation: (repositories: OrderRepositories) => Promise<T>): Promise<T>;
}

export type OrderManagementRepositories = OrderRepositories & {
  transactions: TransactionManager;
};
