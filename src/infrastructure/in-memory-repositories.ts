import type {
  CustomerRepository,
  InventoryRepository,
  OrderManagementRepositories,
  OrderRepository,
  ProductRepository
} from "../application/ports/repositories.js";
import type { Customer, Inventory, Order, Product } from "../domain/order-model.js";

class InMemoryCustomerRepository implements CustomerRepository {
  private readonly records = new Map<string, Customer>();

  findById(id: string): Customer | null {
    return this.records.get(id) ?? null;
  }

  findByEmail(email: string): Customer | null {
    const normalized = email.toLowerCase();
    return [...this.records.values()].find((customer) => customer.email.toLowerCase() === normalized) ?? null;
  }

  save(customer: Customer): void {
    this.records.set(customer.id, customer);
  }
}

class InMemoryProductRepository implements ProductRepository {
  private readonly records = new Map<string, Product>();

  findById(id: string): Product | null {
    return this.records.get(id) ?? null;
  }

  findBySku(sku: string): Product | null {
    const normalized = sku.toLowerCase();
    return [...this.records.values()].find((product) => product.sku.toLowerCase() === normalized) ?? null;
  }

  save(product: Product): void {
    this.records.set(product.id, product);
  }
}

class InMemoryInventoryRepository implements InventoryRepository {
  private readonly records = new Map<string, Inventory>();

  findByProductId(productId: string): Inventory | null {
    return this.records.get(productId) ?? null;
  }

  save(inventory: Inventory): void {
    this.records.set(inventory.productId, inventory);
  }
}

class InMemoryOrderRepository implements OrderRepository {
  private readonly records = new Map<string, Order>();

  findById(id: string): Order | null {
    return this.records.get(id) ?? null;
  }

  save(order: Order): void {
    this.records.set(order.id, order);
  }
}

export function createInMemoryRepositories(): OrderManagementRepositories {
  return {
    customers: new InMemoryCustomerRepository(),
    products: new InMemoryProductRepository(),
    inventory: new InMemoryInventoryRepository(),
    orders: new InMemoryOrderRepository()
  };
}
