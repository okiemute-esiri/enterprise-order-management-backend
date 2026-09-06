import type {
  CustomerRepository,
  InventoryRepository,
  OrderManagementRepositories,
  OrderRepository,
  ProductRepository,
  TransactionManager
} from "../application/ports/repositories.js";
import type { Customer, Inventory, Order, Product } from "../domain/order-model.js";

class InMemoryCustomerRepository implements CustomerRepository {
  constructor(private records = new Map<string, Customer>()) {}
  findById(id: string): Customer | null { return this.records.get(id) ?? null; }
  findByEmail(email: string): Customer | null {
    const normalized = email.toLowerCase();
    return [...this.records.values()].find((customer) => customer.email.toLowerCase() === normalized) ?? null;
  }
  save(customer: Customer): void { this.records.set(customer.id, customer); }
  snapshot(): Map<string, Customer> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Customer>): void { this.records = snapshot; }
}

class InMemoryProductRepository implements ProductRepository {
  constructor(private records = new Map<string, Product>()) {}
  findById(id: string): Product | null { return this.records.get(id) ?? null; }
  findBySku(sku: string): Product | null {
    const normalized = sku.toLowerCase();
    return [...this.records.values()].find((product) => product.sku.toLowerCase() === normalized) ?? null;
  }
  save(product: Product): void { this.records.set(product.id, product); }
  snapshot(): Map<string, Product> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Product>): void { this.records = snapshot; }
}

class InMemoryInventoryRepository implements InventoryRepository {
  constructor(private records = new Map<string, Inventory>()) {}
  findByProductId(productId: string): Inventory | null { return this.records.get(productId) ?? null; }
  save(inventory: Inventory): void { this.records.set(inventory.productId, inventory); }
  snapshot(): Map<string, Inventory> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Inventory>): void { this.records = snapshot; }
}

class InMemoryOrderRepository implements OrderRepository {
  constructor(private records = new Map<string, Order>()) {}
  findById(id: string): Order | null { return this.records.get(id) ?? null; }
  save(order: Order): void { this.records.set(order.id, order); }
  snapshot(): Map<string, Order> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Order>): void { this.records = snapshot; }
}

class InMemoryTransactionManager implements TransactionManager {
  constructor(
    private readonly customers: InMemoryCustomerRepository,
    private readonly products: InMemoryProductRepository,
    private readonly inventory: InMemoryInventoryRepository,
    private readonly orders: InMemoryOrderRepository
  ) {}

  run<T>(operation: () => T): T {
    const snapshots = {
      customers: this.customers.snapshot(),
      products: this.products.snapshot(),
      inventory: this.inventory.snapshot(),
      orders: this.orders.snapshot()
    };

    try {
      return operation();
    } catch (error) {
      this.customers.restore(snapshots.customers);
      this.products.restore(snapshots.products);
      this.inventory.restore(snapshots.inventory);
      this.orders.restore(snapshots.orders);
      throw error;
    }
  }
}

export function createInMemoryRepositories(): OrderManagementRepositories {
  const customers = new InMemoryCustomerRepository();
  const products = new InMemoryProductRepository();
  const inventory = new InMemoryInventoryRepository();
  const orders = new InMemoryOrderRepository();

  return {
    customers,
    products,
    inventory,
    orders,
    transactions: new InMemoryTransactionManager(customers, products, inventory, orders)
  };
}
