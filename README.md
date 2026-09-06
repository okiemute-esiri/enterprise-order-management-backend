# Enterprise Order Management Backend

A production-oriented TypeScript backend demonstrating customer, product, inventory and order-management workflows with explicit business-state rules, validation, automated tests, Docker packaging and CI.

> **Project status:** The repository now includes in-memory and Prisma/PostgreSQL persistence, transaction-scoped repository adapters, PostgreSQL-backed integration tests, concurrency-safe reservation semantics verified under competing confirmations, request correlation IDs, an OpenAPI specification, Docker packaging and CI-backed database verification.

## Implemented

- Node.js 22 + TypeScript + Express
- strict TypeScript configuration
- versioned `/api/v1` API
- HTTP adapter separated from application workflow logic
- `OrderManagementService` application layer
- asynchronous repository ports for customers, products, inventory and orders
- in-memory repository adapters used by the default test composition
- explicit transaction boundary with rollback semantics in the in-memory adapter
- Prisma PostgreSQL schema and initial migration
- PostgreSQL repository adapters
- transaction-scoped Prisma repositories using `$transaction`
- runtime selection between PostgreSQL and in-memory persistence
- customer creation with normalized duplicate-email protection
- product creation with normalized unique-SKU protection
- inventory adjustments with negative-stock protection
- order creation with price snapshots and calculated totals
- order confirmation with aggregate inventory validation and reservation
- protection against duplicate product lines exceeding total available stock
- concurrency-safe PostgreSQL reservation semantics verified with competing confirmations
- order cancellation with reserved-stock restoration
- controlled order-state transitions
- Zod request validation
- structured domain errors
- request correlation via `x-request-id` generation/preservation
- liveness and readiness endpoints
- graceful SIGTERM/SIGINT shutdown
- Vitest application-service tests
- Vitest + Supertest API workflow tests
- PostgreSQL integration tests for persisted confirmation, cancellation and concurrency behavior
- OpenAPI 3.0 specification in `docs/openapi.yaml`
- multi-stage non-root Docker image with generated Prisma client
- GitHub Actions CI configured with PostgreSQL 16, migrations, typecheck, tests, build and Docker verification

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
Repository ports + transaction boundary
        |
        +-------------------+
        |                   |
        v                   v
In-memory adapters     Prisma/PostgreSQL adapters
                           |
                           v
                    PostgreSQL transaction
```

The application service owns business workflow decisions but does not own storage collections. Persistence access is defined through interfaces for customers, products, inventory and orders. Transactional workflows receive transaction-scoped repositories, so database concerns remain outside the HTTP and application layers.

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

The full OpenAPI contract is documented in `docs/openapi.yaml`.

All HTTP responses include an `x-request-id` header. A caller-provided `x-request-id` is preserved; otherwise the service generates one.

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

For PostgreSQL, reservation uses atomic conditional persistence semantics inside the transaction boundary. The concurrency integration test starts competing confirmations against stock that can satisfy only one order and verifies that overselling does not occur.

When a confirmed order is cancelled, reserved quantities are released back to available inventory.

## PostgreSQL

Set `DATABASE_URL` to use PostgreSQL at runtime. Without it, the service uses the in-memory adapters.

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

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
npm run prisma:generate
npm run typecheck
npm test
npm run build
docker build -t enterprise-order-management-backend .
```

## CI

GitHub Actions runs PostgreSQL 16 and performs migration deployment, type checking, unit/API/integration tests, production build and Docker image verification.

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
- [x] Introduce asynchronous repository interfaces
- [x] Add in-memory repository adapters
- [x] Add application-service and API tests
- [x] Add transaction abstraction and in-memory rollback coverage
- [x] Add Prisma PostgreSQL schema and migration
- [x] Add PostgreSQL repository adapters
- [x] Add Prisma transaction-scoped repository boundary
- [x] Add PostgreSQL integration tests
- [x] Configure PostgreSQL CI service and migration deployment
- [x] Verify PostgreSQL CI on main
- [x] Add concurrency-safe inventory reservation
- [x] Add concurrency integration tests proving no overselling
- [x] Add Docker packaging
- [x] Add operational health endpoints
- [x] Add graceful shutdown
- [x] Add OpenAPI specification
- [x] Add request correlation IDs
- [ ] Translate database uniqueness races to stable domain conflicts
- [ ] Add fulfilment/completion workflow
- [ ] Add structured JSON logging
- [ ] Add Redis only where a justified cache or coordination use case exists
- [ ] Add performance/load testing

## Engineering Focus

This repository demonstrates backend engineering beyond CRUD: application-layer orchestration, dependency inversion at the persistence boundary, transaction-scoped repositories, durable PostgreSQL persistence, concurrency-safe inventory reservation, domain-state enforcement, deterministic errors, price snapshots, API documentation, request correlation, automated verification, container packaging and CI-backed database testing.
