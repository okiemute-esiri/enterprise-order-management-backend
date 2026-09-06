# Enterprise Order Management Backend

A production-oriented TypeScript backend demonstrating customer, product, inventory and order-management workflows with explicit business-state rules, validation, automated tests, Docker packaging and CI.

> **Project status:** A runnable in-memory implementation is present. Repository ports now isolate the application service from persistence. PostgreSQL, Redis and durable transaction boundaries remain roadmap items and are not claimed as implemented.

## Implemented

- Node.js 22 + TypeScript + Express
- strict TypeScript configuration
- versioned `/api/v1` API
- HTTP adapter separated from application workflow logic
- `OrderManagementService` application layer
- repository ports for customers, products, inventory and orders
- in-memory repository adapters used by the default runtime composition
- customer creation with case-insensitive duplicate-email protection
- product creation with case-insensitive unique-SKU protection
- inventory adjustments with negative-stock protection
- order creation with price snapshots and calculated totals
- order confirmation with aggregate inventory validation and reservation
- protection against duplicate product lines exceeding total available stock
- order cancellation with reserved-stock restoration
- controlled order-state transitions
- Zod request validation
- structured domain errors
- liveness and readiness endpoints
- graceful SIGTERM/SIGINT shutdown
- Vitest application-service tests
- Vitest + Supertest API workflow tests
- multi-stage non-root Docker image
- GitHub Actions CI with typecheck, tests, build and Docker verification

## Current Architecture

```text
HTTP / Express adapter
        |
        v
Request validation
        |
        v
OrderManagementService
        |
        v
Repository ports
        |
        v
In-memory repository adapters
```

The application service owns business workflow decisions but does not own storage collections. Persistence access is defined through interfaces for customers, products, inventory and orders. The default runtime composes those ports with in-memory adapters, so a durable implementation can be introduced without moving database concerns into the HTTP or application layers.

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

Confirmation aggregates quantities by product before mutating inventory. If duplicate order lines request the same product, their combined quantity is validated against available stock. If any aggregate requirement cannot be satisfied, confirmation fails with `409 INSUFFICIENT_INVENTORY`, inventory is left unchanged and the order remains pending.

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

The service snapshots the current product price into each order item and calculates `lineTotal` and order `total`.

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

The automated tests cover successful customer/product/inventory/order flow, confirmation, insufficient inventory rejection, cancellation, application-service state invariants, case-insensitive duplicate-email rejection and the aggregate duplicate-product-line inventory invariant.

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
- [x] Protect aggregate inventory across duplicate order lines
- [x] Implement cancellation and stock restoration
- [x] Add validation and standardized errors
- [x] Separate HTTP adapter from application service
- [x] Introduce repository interfaces
- [x] Add in-memory repository adapters
- [x] Add application-service and API tests
- [x] Add Docker packaging
- [x] Add GitHub Actions CI
- [x] Add operational health endpoints
- [x] Add graceful shutdown
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

This repository demonstrates backend engineering beyond CRUD: application-layer orchestration, dependency inversion at the persistence boundary, domain-state enforcement, inventory consistency, deterministic error semantics, price snapshots, automated verification, container packaging and a clear migration path toward durable transactional persistence.
