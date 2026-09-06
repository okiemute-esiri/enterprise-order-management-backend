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
  async findById(id: string): Promise<Customer | null> { return this.records.get(id) ?? null; }
  async findByEmail(email: string): Promise<Customer | null> {
    const normalized = email.toLowerCase();
    return [...this.records.values()].find((customer) => customer.email.toLowerCase() === normalized) ?? null;
  }
  async save(customer: Customer): Promise<void> { this.records.set(customer.id, customer); }
  snapshot(): Map<string, Customer> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Customer>): void { this.records = snapshot; }
}

class InMemoryProductRepository implements ProductRepository {
  constructor(private records = new Map<string, Product>()) {}
  async findById(id: string): Promise<Product | null> { return this.records.get(id) ?? null; }
  async findBySku(sku: string): Promise<Product | null> {
    const normalized = sku.toLowerCase();
    return [...this.records.values()].find((product) => product.sku.toLowerCase() === normalized) ?? null;
  }
  async save(product: Product): Promise<void> { this.records.set(product.id, product); }
  snapshot(): Map<string, Product> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Product>): void { this.records = snapshot; }
}

class InMemoryInventoryRepository implements InventoryRepository {
  constructor(private records = new Map<string, Inventory>()) {}
  async findByProductId(productId: string): Promise<Inventory | null> { return this.records.get(productId) ?? null; }
  async save(inventory: Inventory): Promise<void> { this.records.set(inventory.productId, inventory); }
  snapshot(): Map<string, Inventory> { return new Map([...this.records].map(([id, value]) => [id, structuredClone(value)])); }
  restore(snapshot: Map<string, Inventory>): void { this.records = snapshot; }
}

class InMemoryOrderRepository implements OrderRepository {
  constructor(private records = new Map<string, Order>()) {}
  async findById(id: string): Promise<Order | null> { return this.records.get(id) ?? null; }
  async save(order: Order): Promise<void> { this.records.set(order.id, order); }
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

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const snapshots = {
      customers: this.customers.snapshot(),
      products: this.products.snapshot(),
      inventory: this.inventory.snapshot(),
      orders: this.orders.snapshot()
    };

    try {
      return await operation();
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
