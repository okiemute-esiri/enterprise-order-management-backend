import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CustomerRepository,
  InventoryRepository,
  OrderManagementRepositories,
  OrderRepositories,
  OrderRepository,
  ProductRepository,
  TransactionManager
} from "../application/ports/repositories.js";
import type { Customer, Inventory, Order, OrderStatus, Product } from "../domain/order-model.js";

type PrismaDatabase = PrismaClient | Prisma.TransactionClient;

class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async findById(id: string): Promise<Customer | null> {
    return this.db.customer.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return this.db.customer.findUnique({ where: { email: email.toLowerCase() } });
  }

  async save(customer: Customer): Promise<void> {
    await this.db.customer.upsert({
      where: { id: customer.id },
      create: { ...customer, email: customer.email.toLowerCase() },
      update: { name: customer.name, email: customer.email.toLowerCase() }
    });
  }
}

class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async findById(id: string): Promise<Product | null> {
    const product = await this.db.product.findUnique({ where: { id } });
    return product ? { ...product, unitPrice: Number(product.unitPrice) } : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const product = await this.db.product.findUnique({ where: { sku: sku.toUpperCase() } });
    return product ? { ...product, unitPrice: Number(product.unitPrice) } : null;
  }

  async save(product: Product): Promise<void> {
    await this.db.product.upsert({
      where: { id: product.id },
      create: { ...product, sku: product.sku.toUpperCase() },
      update: { sku: product.sku.toUpperCase(), name: product.name, unitPrice: product.unitPrice }
    });
  }
}

class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async findByProductId(productId: string): Promise<Inventory | null> {
    return this.db.inventory.findUnique({ where: { productId } });
  }

  async save(inventory: Inventory): Promise<void> {
    await this.db.inventory.upsert({
      where: { productId: inventory.productId },
      create: inventory,
      update: {
        availableQuantity: inventory.availableQuantity,
        reservedQuantity: inventory.reservedQuantity
      }
    });
  }

  async reserveAvailable(productId: string, quantity: number): Promise<Inventory | null> {
    const result = await this.db.inventory.updateMany({
      where: { productId, availableQuantity: { gte: quantity } },
      data: {
        availableQuantity: { decrement: quantity },
        reservedQuantity: { increment: quantity }
      }
    });
    if (result.count !== 1) return null;
    return this.db.inventory.findUnique({ where: { productId } });
  }

  async releaseReserved(productId: string, quantity: number): Promise<Inventory | null> {
    const result = await this.db.inventory.updateMany({
      where: { productId, reservedQuantity: { gte: quantity } },
      data: {
        availableQuantity: { increment: quantity },
        reservedQuantity: { decrement: quantity }
      }
    });
    if (result.count !== 1) return null;
    return this.db.inventory.findUnique({ where: { productId } });
  }
}

class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async findById(id: string): Promise<Order | null> {
    const order = await this.db.order.findUnique({
      where: { id },
      include: { items: { orderBy: { id: "asc" } } }
    });
    if (!order) return null;
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      total: Number(order.total),
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal)
      }))
    };
  }

  async save(order: Order): Promise<void> {
    const items = order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal
    }));

    await this.db.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        customerId: order.customerId,
        status: order.status,
        total: order.total,
        items: { create: items }
      },
      update: {
        customerId: order.customerId,
        status: order.status,
        total: order.total,
        items: { deleteMany: {}, create: items }
      }
    });
  }

  async transitionStatus(id: string, expected: OrderStatus, next: OrderStatus): Promise<boolean> {
    const result = await this.db.order.updateMany({
      where: { id, status: expected },
      data: { status: next }
    });
    return result.count === 1;
  }
}

function createRepositorySet(db: PrismaDatabase): OrderRepositories {
  return {
    customers: new PrismaCustomerRepository(db),
    products: new PrismaProductRepository(db),
    inventory: new PrismaInventoryRepository(db),
    orders: new PrismaOrderRepository(db)
  };
}

class PrismaTransactionManager implements TransactionManager {
  constructor(private readonly client: PrismaClient) {}

  async run<T>(operation: (repositories: OrderRepositories) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => operation(createRepositorySet(tx)));
  }
}

export function createPrismaRepositories(client: PrismaClient): OrderManagementRepositories {
  return {
    ...createRepositorySet(client),
    transactions: new PrismaTransactionManager(client)
  };
}
