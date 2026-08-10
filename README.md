# Edyn Digital Hub API

Backend API for the Edyn Digital Hub website, admin dashboard, publications, payments, contact messages, newsletters, and analytics.

## Stack

- Node.js and Express
- TypeScript
- Prisma ORM
- Supabase PostgreSQL, Auth, and private Storage
- Paystack payments
- Render deployment

## Local setup

1. Install Node.js 22.18 or newer.
2. Copy `.env.example` to `.env` and provide development/test credentials.
3. Install dependencies with `npm install`.
4. Generate Prisma Client with `npm run prisma:generate`.
5. Create the first migration with `npm run prisma:migrate:dev -- --name initial_schema`.
6. Seed the database with `npm run prisma:seed`.
7. Start the API with `npm run dev`.

For a long-running Render web service, use the Supabase Supavisor Session
pooler connection shown under **Dashboard > Connect**. Keep the transaction
pooler on port 6543 for serverless or highly auto-scaling runtimes.

The API runs at `http://localhost:5000` by default. Health status is available at `/api/v1/health`.

## Environment safety

- Never commit `.env` files.
- Frontend variables may only contain public values.
- Keep database, Supabase secret, and Paystack secret keys on the server.
- Use Paystack test keys outside production.
- Use separate Supabase projects for development/staging and production when possible.

## Current milestone

This initial foundation includes environment validation, security middleware, request IDs, rate limiting, structured errors, health routes, Prisma models, seed data, tests, and Render configuration. Feature routes will be implemented in subsequent milestones.
