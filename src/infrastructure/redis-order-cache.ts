import { createClient } from "redis";
import type { OrderCache } from "../application/ports/order-cache.js";
import type { Order } from "../domain/order-model.js";

export class RedisOrderCache implements OrderCache {
  private constructor(
    private readonly client: ReturnType<typeof createClient>,
    private readonly ttlSeconds: number
  ) {}

  static async connect(url: string, ttlSeconds = 30): Promise<RedisOrderCache> {
    const client = createClient({ url });
    await client.connect();
    return new RedisOrderCache(client, ttlSeconds);
  }

  private key(orderId: string): string {
    return `order:${orderId}`;
  }

  async get(orderId: string): Promise<Order | null> {
    const value = await this.client.get(this.key(orderId));
    if (!value) return null;
    return JSON.parse(value) as Order;
  }

  async set(order: Order): Promise<void> {
    await this.client.set(this.key(order.id), JSON.stringify(order), { EX: this.ttlSeconds });
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
