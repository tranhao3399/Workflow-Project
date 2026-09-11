# Backend

NestJS API with MongoDB, JWT authentication, and the global `/api` prefix.

## Environment

Create `backend/.env` from `.env.example` and set these values:

```env
PORT=3000
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/workflow_db
JWT_SECRET=use-a-long-random-secret-here
JWT_EXPIRES_IN=1d
```

`JWT_SECRET` must be a private random value and must never be committed.

## Auth API

Register a user:

```http
POST /api/auth/register
Content-Type: application/json

{
  "fullName": "Nguyen Van A",
  "email": "a@example.com",
  "password": "password123",
  "role": "EMPLOYEE",
  "department": "Engineering"
}
```

Log in:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "a@example.com",
  "password": "password123"
}
```

Use the returned `accessToken` with `Authorization: Bearer <accessToken>` for `GET /api/auth/me`.
