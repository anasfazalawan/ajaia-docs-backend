# Ajaia Docs — Backend API & Real-Time Collaboration Server

An AI-native collaborative document editor backend powered by **NestJS**, **Prisma ORM**, **Supabase PostgreSQL**, and **Yjs / Hocuspocus WebSockets**.

**Candidate:** Muhammad Anas Fazal ([anasfazalawan@gmail.com](mailto:anasfazalawan@gmail.com))  
**Live Backend API:** [https://ajaia-docs-backend-ioxf.onrender.com/api](https://ajaia-docs-backend-ioxf.onrender.com/api)  
**Live Frontend App:** [https://ajaia-docs-frontend-five.vercel.app](https://ajaia-docs-frontend-five.vercel.app)  
**Backend Repository:** [https://github.com/anasfazalawan/ajaia-docs-backend](https://github.com/anasfazalawan/ajaia-docs-backend)  
**Frontend Repository:** [https://github.com/anasfazalawan/ajaia-docs-frontend](https://github.com/anasfazalawan/ajaia-docs-frontend)  
**Architecture & AI Workflow Gist:** [https://gist.github.com/anasfazalawan/1588dd8504276740e30d8eb5624dfc3e](https://gist.github.com/anasfazalawan/1588dd8504276740e30d8eb5624dfc3e)  

---

## Architecture & Features

- **NestJS REST API**: Modular endpoints for documents, user authorization, document sharing (RBAC: `owner`, `editor`, `viewer`), version history snapshots, and file imports.
- **Real-Time Collaboration (Yjs + Hocuspocus)**: Conflict-free replicated data types (CRDTs) for multi-cursor real-time editing and live collaborator presence.
- **Supabase PostgreSQL & Auth Interop**: High-security cryptographic JWT verification (`HS256`), row-level authorization, and user auto-provisioning.
- **Throttling & Abuse Prevention**: Built-in 2.5s document creation throttling and IP rate-limiting via `@nestjs/throttler`.
- **Health Checks**: Zero-auth `/api/health` monitoring endpoint with live database connectivity probes.

---

## Tech Stack

- **Framework**: [NestJS 10](https://nestjs.com/)
- **Database ORM**: [Prisma 5](https://www.prisma.io/) (PostgreSQL on Supabase)
- **Real-Time Engine**: [Hocuspocus Server](https://tiptap.dev/hocuspocus) & [Yjs](https://yjs.dev/)
- **Authentication**: [Supabase Auth](https://supabase.com/docs/guides/auth) + `jsonwebtoken`
- **Testing**: [Jest](https://jestjs.io/) & [Supertest](https://github.com/ladjs/supertest)

---

## Getting Started

### 1. Prerequisites
- Node.js `v18.18+` (v20 Recommended)
- Supabase Project with Postgres Database & JWT Secret

### 2. Environment Variables
Create a `.env` file in the root of `backend/`:

```env
# Database Connection (Supabase Transaction Pooler)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct Connection (Supabase Session Pooler / Migrations)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Supabase Auth Settings
SUPABASE_URL="https://[your-project-ref].supabase.co"
SUPABASE_ANON_KEY="eyJhbGci..."
SUPABASE_JWT_SECRET="your-jwt-secret"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."

# App Configuration
PORT=4000
FRONTEND_URL="http://localhost:3000"

# Collaboration Server
COLLAB_PORT=1234
```

### 3. Installation & Database Setup
```bash
# Install dependencies
npm install

# Generate Prisma Client & Sync Schema
npx prisma generate
npx prisma db push
```

### 4. Running the Server
```bash
# Development mode (Hot-reload)
npm run start:dev

# Production build & start
npm run build
npm run start:prod
```

### 5. Running Tests
```bash
# Run unit test suite
npm run test
```

---

## API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service health & DB connectivity check | No |
| `GET` | `/api/documents` | List user's owned & shared documents | Yes (Bearer JWT) |
| `POST` | `/api/documents` | Create a new document (Throttled) | Yes |
| `GET` | `/api/documents/:id` | Fetch document details & access role | Yes |
| `PATCH` | `/api/documents/:id` | Update document title or content | Yes (Editor/Owner) |
| `DELETE` | `/api/documents/:id` | Delete document | Yes (Owner Only) |
| `POST` | `/api/documents/:id/leave` | Leave a shared document | Yes (Shared User) |
| `GET` | `/api/documents/:id/versions` | List version checkpoints | Yes |
| `POST` | `/api/documents/:id/versions` | Create manual snapshot | Yes (Editor/Owner) |
| `POST` | `/api/documents/:id/versions/:vId/restore` | Restore previous version | Yes (Editor/Owner) |
| `GET` | `/api/documents/:id/shares` | List document shares | Yes (Owner Only) |
| `POST` | `/api/documents/:id/shares` | Share document by email | Yes (Owner Only) |
| `DELETE` | `/api/documents/:id/shares/:shareId` | Revoke share access | Yes (Owner Only) |
| `POST` | `/api/upload/import` | Import `.txt` or `.md` file | Yes |

---

## Author

**Muhammad Anas Fazal**  
Email: [anasfazalawan@gmail.com](mailto:anasfazalawan@gmail.com)
