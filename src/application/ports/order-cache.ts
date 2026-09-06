import type { Order } from "../../domain/order-model.js";

export interface OrderCache {
  get(orderId: string): Promise<Order | null>;
  set(order: Order): Promise<void>;
  close(): Promise<void>;
}

export const noopOrderCache: OrderCache = {
  async get() { return null; },
  async set() {},
  async close() {}
};
