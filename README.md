# Enterprise Order Management Backend

A production-oriented TypeScript backend demonstrating customer, product, inventory and order-management workflows with explicit business-state rules, validation, automated tests, Docker packaging and CI.

> **Project status:** A runnable in-memory implementation is now present. PostgreSQL, Redis and durable transaction boundaries remain roadmap items and are not claimed as implemented.

## Implemented

- Node.js 22 + TypeScript + Express
- strict TypeScript configuration
- versioned `/api/v1` API
- customer creation with duplicate-email conflict protection
- product creation with unique SKU protection
- inventory adjustments with negative-stock protection
- order creation with price snapshots and calculated totals
- order confirmation with inventory reservation
- insufficient-inventory protection
- order cancellation with reserved-stock restoration
- controlled order-state transitions
- Zod request validation
- structured domain errors
- liveness and readiness endpoints
- graceful SIGTERM/SIGINT shutdown
- Vitest + Supertest workflow tests
- multi-stage non-root Docker image
- GitHub Actions CI with typecheck, tests, build and Docker verification

## Current Architecture

```text
HTTP / Express
      |
      v
Validation + Route Handlers
      |
      v
Domain Workflow Rules
      |
      v
In-Memory State
 customers / products / inventory / orders
```

The current persistence layer is intentionally in-memory so the business workflow can be executed and tested without external infrastructure. The next major persistence milestone is PostgreSQL with repository abstractions and transactional confirmation.

## API

```text
GET  /health/live
GET  /health/ready

POST /api/v1/customers
POST /api/v1/products
POST /api/v1/inventory/:productId/adjustments
POST /api/v1/orders
GET  /api/v1/orders/:orderId
POST /api/v1/orders/:orderId/confirm
POST /api/v1/orders/:orderId/cancel
```

## Order Workflow

```text
PENDING
  | \
  |  \ cancel
  v   v
CONFIRMED   CANCELLED
  |
  | future fulfilment workflow
  v
FULFILLED
```

Confirmation validates every requested line before mutating stock. If any item has insufficient inventory, confirmation fails with `409 INSUFFICIENT_INVENTORY` and the order remains pending.

When a confirmed order is cancelled, reserved quantities are released back to available inventory.

## Example

Create a customer:

```json
{
  "name": "Acme Corp",
  "email": "ops@acme.test"
}
```

Create a product:

```json
{
  "sku": "SKU-100",
  "name": "Industrial Sensor",
  "unitPrice": 125
}
```

Adjust inventory:

```json
{
  "quantity": 10
}
```

Create an order:

```json
{
  "customerId": "<uuid>",
  "items": [
    {
      "productId": "<uuid>",
      "quantity": 2
    }
  ]
}
```

The service snapshots the current product price into the order item and calculates `lineTotal` and order `total`.

## Error Semantics

| Condition | HTTP | Code |
| --- | ---: | --- |
| Request validation failure | 422 | `VALIDATION_ERROR` |
| Duplicate customer email | 409 | `CUSTOMER_EMAIL_CONFLICT` |
| Duplicate product SKU | 409 | `SKU_CONFLICT` |
| Unknown customer | 404 | `CUSTOMER_NOT_FOUND` |
| Unknown product | 404 | `PRODUCT_NOT_FOUND` |
| Unknown order | 404 | `ORDER_NOT_FOUND` |
| Insufficient stock | 409 | `INSUFFICIENT_INVENTORY` |
| Invalid inventory adjustment | 409 | `INVALID_INVENTORY_ADJUSTMENT` |
| Invalid order transition | 409 | `INVALID_ORDER_STATE` |

## Run Locally

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

## Validation

```bash
npm run typecheck
npm test
npm run build
docker build -t enterprise-order-management-backend .
```

The automated tests currently cover successful customer/product/inventory/order flow, successful confirmation, insufficient inventory rejection and cancellation of confirmed orders.

## Docker

```bash
docker build -t enterprise-order-management-backend .
docker run --rm -p 3000:3000 enterprise-order-management-backend
```

The runtime image uses Node.js 22 Alpine and runs as the non-root `node` user.

## CI

GitHub Actions performs:

```text
Install dependencies
      |
Type check
      |
Tests
      |
Production build
      |
Docker image build
```

## Roadmap

- [x] Initialize TypeScript backend
- [x] Implement customer module
- [x] Implement product module
- [x] Implement inventory adjustment rules
- [x] Implement order creation and totals
- [x] Implement inventory reservation during confirmation
- [x] Implement cancellation and stock restoration
- [x] Add validation and standardized errors
- [x] Add automated API tests
- [x] Add Docker packaging
- [x] Add GitHub Actions CI
- [x] Add operational health endpoints
- [x] Add graceful shutdown
- [ ] Introduce repository interfaces
- [ ] Add PostgreSQL persistence and migrations
- [ ] Add atomic database transaction for order confirmation
- [ ] Add optimistic concurrency control
- [ ] Add fulfilment/completion workflow
- [ ] Add OpenAPI specification
- [ ] Add structured logging and request correlation IDs
- [ ] Add Redis only where a justified cache or coordination use case exists
- [ ] Add database integration tests
- [ ] Add performance/load testing

## Engineering Focus

This repository is intended to demonstrate backend engineering beyond CRUD: domain-state enforcement, inventory consistency, deterministic error semantics, price snapshots, automated verification, container packaging and a clear migration path toward durable transactional persistence.
