# StockFlow Auth Source - Setup Notes

This ZIP contains a repaired/refactored NestJS `src/` folder based on the authentication approach from `full_auth_nest_js`.

## Main changes

- `auth` and `users` separated into dedicated modules.
- JWT access + rotating refresh tokens.
- Refresh token hashes stored instead of raw tokens.
- Secure-by-default global JWT guard with `@Public()` opt-out.
- Role guard supports controller and handler metadata.
- StockFlow roles: admin, warehouse_manager, warehouse_worker.
- Public registration removed; admins create users.
- Password and refresh-token hashes use `select: false`.
- Explicit bcrypt hashing in the service instead of entity hooks.
- Global DTO whitelist/transform validation.
- Startup validation for required environment variables.
- TypeORM `synchronize` enabled only in development.

## Required packages

Install these in the fresh NestJS project if they are not already installed:

npm install @nestjs/config @nestjs/typeorm typeorm pg
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install bcrypt class-validator class-transformer

npm install -D @types/bcrypt @types/passport-jwt

## Required environment variables

NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=stockflow

JWT_ACCESS_SECRET=replace-with-a-random-secret-at-least-32-characters
JWT_ACCESS_EXPIRES_IN=15m

JWT_REFRESH_SECRET=replace-with-another-random-secret-at-least-32-characters
JWT_REFRESH_EXPIRES_IN=7d

# Optional comma-separated origins. Flutter native does not require CORS.
CORS_ORIGIN=http://localhost:5173

# Used only by the explicit development seed command:
ADMIN_NAME=StockFlow Admin
ADMIN_EMAIL=admin@stockflow.local
ADMIN_PASSWORD=replace-with-a-long-development-password

## Bootstrap the first admin

There is intentionally NO hard-coded default admin and no public `/auth/register`.

After the database is available, run the explicit seed once:

npx ts-node src/seed/seed-admin.ts

The seed reads ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD from the environment,
hashes the password through UsersService, and skips creation if the email already exists.

## API

POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout

GET   /api/users/me
GET   /api/users
POST  /api/users
GET   /api/users/:id
PATCH /api/users/:id
PATCH /api/users/:id/role

All endpoints are protected by default except login and refresh.

## Current refresh-session scope

This V1 stores one refresh-token hash per user. Logging in again rotates that user's
refresh session, which is fine for the first mobile demo. If StockFlow later needs
multiple simultaneous devices per user, replace the single hash with a dedicated
sessions table (one row per device/session).
