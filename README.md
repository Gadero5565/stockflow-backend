# StockFlow Backend

Backend API for StockFlow, a mobile-first warehouse and inventory management system built with NestJS and PostgreSQL.

The project will be consumed by a Flutter mobile application and is designed to support future ERP/Odoo integration.

## Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- TypeORM
- JWT Authentication
- Passport
- bcrypt
- class-validator

## Current Features

### Authentication

- JWT access tokens
- Rotating refresh tokens
- Secure refresh-token hashing
- Login and logout
- Protected routes
- Environment validation

### User Management

- User creation
- User updates
- Role management
- Active/inactive users
- Role-based access control

### Roles

- Admin
- Warehouse Manager
- Warehouse Worker

## Planned Modules

- Products
- Warehouses
- Locations
- Inventory
- Stock Transfers
- Stock Movements
- Barcode scanning
- Notifications
- Audit logs

## Mobile Application

A Flutter mobile client will be developed separately.

## Future Integration

StockFlow is designed to later support synchronization with Odoo Inventory, including products, locations, warehouses, and stock transfers.

## Setup

Install dependencies:

```bash
npm install
```

Create the environment configuration:

```bash
cp .env.example .env
```

Configure PostgreSQL and the required environment variables.

Start the development server:

```bash
npm run start:dev
```

API base URL:

```text
http://localhost:3000/api
```

## Authentication API

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

## Users API

```text
GET   /api/users/me
GET   /api/users
POST  /api/users
GET   /api/users/:id
PATCH /api/users/:id
PATCH /api/users/:id/role
```

## Project Goal

The goal of StockFlow is to provide a practical warehouse management platform while demonstrating a complete backend and mobile architecture using NestJS and Flutter.

The project will gradually include inventory operations, warehouse locations, stock transfers, barcode-based workflows, offline mobile support, and future integration with Odoo.