# Enterprise Order Management Backend

A production-oriented backend engineering portfolio project focused on the architecture and implementation of a scalable order-management service.

> **Project status:** Architecture and implementation roadmap defined. The repository is being developed incrementally; sections below distinguish the target design from completed implementation.

## Overview

The system is designed to manage the complete lifecycle of enterprise orders, including customers, products, inventory, order creation, validation, status transitions, fulfilment and transaction history.

The project is intended to demonstrate practical backend engineering skills across API design, domain modelling, database design, service-layer architecture, testing, containerization, observability and CI/CD.

## Engineering Objectives

- Design clear domain boundaries for customers, products, inventory and orders.
- Implement maintainable service and repository layers.
- Support transactional workflows and consistency guarantees.
- Provide versioned REST APIs with predictable error handling.
- Use PostgreSQL for relational persistence.
- Introduce Redis where caching or distributed coordination is appropriate.
- Containerize the application and dependencies with Docker.
- Add automated unit, integration and end-to-end testing.
- Establish CI/CD using GitHub Actions.
- Document architecture decisions and operational considerations.

## Target Architecture

```text
Client / API Consumer
        |
        v
+-------------------------+
| REST API / Controllers  |
+-------------------------+
        |
        v
+-------------------------+
| Application Services    |
+-------------------------+
        |
        v
+-------------------------+
| Domain Layer            |
| Orders                  |
| Customers               |
| Products                |
| Inventory               |
+-------------------------+
        |
        v
+-------------------------+
| Repository Interfaces   |
+-------------------------+
        |
        v
+-------------------------+
| Infrastructure Layer    |
| PostgreSQL / Redis      |
+-------------------------+
```

## Proposed Technology Stack

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| API | REST / OpenAPI |
| Database | PostgreSQL |
| Cache | Redis |
| ORM / Data Access | Prisma or repository-based SQL access |
| Validation | Zod or equivalent schema validation |
| Testing | Vitest/Jest, Supertest |
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Observability | Structured logging, metrics and health endpoints |

## Domain Model

### Customer

Represents an organization or individual placing orders.

Typical attributes:

- `id`
- `name`
- `email`
- `status`
- `createdAt`
- `updatedAt`

### Product

Represents a sellable catalogue item.

Typical attributes:

- `id`
- `sku`
- `name`
- `description`
- `unitPrice`
- `status`

### Inventory

Tracks available and reserved stock for products.

Typical attributes:

- `productId`
- `availableQuantity`
- `reservedQuantity`
- `updatedAt`

### Order

Represents a customer purchase request and its lifecycle.

Typical attributes:

- `id`
- `customerId`
- `status`
- `subtotal`
- `tax`
- `total`
- `createdAt`
- `updatedAt`

### Order Item

Represents individual products within an order.

Typical attributes:

- `orderId`
- `productId`
- `quantity`
- `unitPrice`
- `lineTotal`

## Order Lifecycle

```text
DRAFT
  |
  v
PENDING
  |
  v
CONFIRMED
  |
  v
PROCESSING
  |
  v
FULFILLED
  |
  v
COMPLETED

Alternative terminal states:
CANCELLED
FAILED
```

State transitions should be controlled by application/domain logic rather than direct database updates.

## Planned API Surface

### Customers

```http
GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/{id}
PATCH  /api/v1/customers/{id}
```

### Products

```http
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/{id}
PATCH  /api/v1/products/{id}
```

### Inventory

```http
GET    /api/v1/inventory/{productId}
POST   /api/v1/inventory/{productId}/adjustments
POST   /api/v1/inventory/{productId}/reservations
DELETE /api/v1/inventory/{productId}/reservations/{reservationId}
```

### Orders

```http
GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/orders/{id}
PATCH  /api/v1/orders/{id}
POST   /api/v1/orders/{id}/confirm
POST   /api/v1/orders/{id}/cancel
POST   /api/v1/orders/{id}/fulfil
```

## Example Request

```json
{
  "customerId": "cust_123",
  "items": [
    {
      "productId": "prod_1001",
      "quantity": 2
    },
    {
      "productId": "prod_2040",
      "quantity": 1
    }
  ]
}
```

## Example Response

```json
{
  "id": "ord_9001",
  "customerId": "cust_123",
  "status": "PENDING",
  "items": [
    {
      "productId": "prod_1001",
      "quantity": 2,
      "unitPrice": 49.99,
      "lineTotal": 99.98
    }
  ],
  "total": 99.98
}
```

## Error Model

The API is designed around predictable machine-readable errors.

```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Requested quantity is not currently available.",
    "requestId": "req_01J..."
  }
}
```

Expected HTTP semantics include:

- `400` invalid request
- `404` resource not found
- `409` business-state or concurrency conflict
- `422` domain validation failure
- `500` unexpected server failure

## Database Design Considerations

The relational model is intended to preserve transactional integrity between orders, order items, inventory reservations and status transitions.

Key engineering concerns include:

- foreign-key integrity;
- unique constraints for SKUs and business identifiers;
- transaction boundaries around order confirmation;
- optimistic locking for conflicting updates;
- indexes for common order, customer and product queries;
- immutable transaction/audit records where appropriate.

## Consistency Strategy

Order confirmation is expected to execute as an atomic workflow:

1. Validate customer and product state.
2. Validate requested quantities.
3. Reserve inventory.
4. Calculate order totals.
5. Persist the order and order items.
6. Commit the transaction.
7. Publish downstream events after persistence.

A transactional outbox can be introduced for reliable event publication when the system evolves toward asynchronous processing.

## Suggested Project Structure

```text
src/
├── api/
│   ├── controllers/
│   ├── middleware/
│   └── routes/
├── application/
│   ├── commands/
│   ├── queries/
│   └── services/
├── domain/
│   ├── customers/
│   ├── inventory/
│   ├── orders/
│   └── products/
├── infrastructure/
│   ├── database/
│   ├── cache/
│   ├── messaging/
│   └── logging/
├── repositories/
├── config/
└── server.ts

tests/
├── unit/
├── integration/
└── e2e/

docs/
├── architecture.md
├── api.md
└── decisions/
```

## Testing Strategy

The target test pyramid includes:

### Unit Tests

- order-total calculations;
- state-transition rules;
- inventory reservation logic;
- validation and business rules.

### Integration Tests

- PostgreSQL repositories;
- database transactions;
- cache behaviour;
- API-to-database integration.

### End-to-End Tests

- create customer;
- create product;
- add inventory;
- place order;
- confirm order;
- cancel order;
- validate persistence and API responses.

## DevOps Roadmap

The repository is intended to include:

```text
Dockerfile
docker-compose.yml
.github/workflows/ci.yml
```

The CI pipeline will validate:

```text
Install dependencies
      |
      v
Static analysis
      |
      v
Unit tests
      |
      v
Integration tests
      |
      v
Build
      |
      v
Container build
```

## Operational Design

Planned production-readiness features include:

- `/health/live` liveness endpoint;
- `/health/ready` readiness endpoint;
- structured application logs;
- request correlation IDs;
- graceful shutdown;
- database connection pooling;
- configurable timeouts;
- metrics for throughput, latency and failure rates.

## Scalability Considerations

The architecture is intended to remain stateless at the API layer so multiple application instances can run behind a load balancer.

Potential scale-out improvements include:

- Redis caching;
- asynchronous order processing;
- message queues;
- separate read models;
- database read replicas;
- service decomposition when justified by domain or scaling boundaries.

## Architecture Principles

This project emphasizes:

- separation of concerns;
- explicit domain rules;
- dependency inversion;
- testability;
- transactional consistency;
- observable operations;
- evolvable interfaces;
- production-oriented documentation.

## Implementation Roadmap

- [x] Define project scope and architecture.
- [x] Define domain model and API surface.
- [ ] Initialize TypeScript backend.
- [ ] Add PostgreSQL persistence.
- [ ] Implement customer and product modules.
- [ ] Implement inventory reservation logic.
- [ ] Implement order lifecycle.
- [ ] Add validation and standardized errors.
- [ ] Add unit and integration tests.
- [ ] Add Docker and Docker Compose.
- [ ] Add OpenAPI documentation.
- [ ] Add GitHub Actions CI.
- [ ] Add observability and health checks.
- [ ] Add performance and load testing.

## Portfolio Context

This repository is part of a broader software-engineering portfolio focused on backend development, distributed systems, APIs, databases, DevOps, cloud infrastructure and software architecture.

The goal is not only to demonstrate framework usage, but to document the engineering decisions required to move a backend service toward production readiness.

## License

This project is intended for educational and portfolio use. A formal open-source license can be added as the implementation matures.
