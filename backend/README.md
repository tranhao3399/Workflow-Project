# Backend

NestJS API with MongoDB, JWT authentication, and the global `/api` prefix.

## Environment

Create `backend/.env` from `.env.example` and set these values:

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/workflow_db
JWT_ACCESS_SECRET=use-a-long-random-secret-here
JWT_ACCESS_TTL=15m
SESSION_ABSOLUTE_TTL_HOURS=24
REFRESH_COOKIE_SECURE=false
```

`JWT_ACCESS_SECRET` must be a private random value and must never be committed. Set `REFRESH_COOKIE_SECURE=true` in production and use the exact HTTPS frontend URL for `FRONTEND_ORIGIN`.

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

Public registration cannot assign the `ADMIN` role. Administrative account creation is performed through the protected `POST /api/users` endpoint.

## Employees and Accounts

`Employee` is the HR profile and `User` is the login/RBAC account. An employee can exist without an account; one account can link to exactly one employee. Existing `User.fullName`, `department`, and single `role` fields remain temporarily for Auth compatibility, while new account creation derives the profile fields from the linked employee.

All endpoints below require an `ADMIN` access token:

```http
GET /api/employees?search=an&department=Engineering&employmentStatus=ACTIVE&page=1&limit=10
POST /api/employees
PATCH /api/employees/:id

GET /api/users
POST /api/users
PATCH /api/users/:id
Authorization: Bearer <admin-access-token>
```

Create an employee first:

```json
{
  "employeeCode": "NV-0009",
  "fullName": "Nguyen Van A",
  "workEmail": "a@company.vn",
  "department": "Engineering",
  "position": "Software Engineer",
  "employmentStatus": "PROBATION"
}
```

Then create its account without duplicating employee profile fields:

```json
{
  "employeeId": "<employee-object-id>",
  "email": "a@company.vn",
  "temporaryPassword": "temporary-password-123",
  "roles": ["EMPLOYEE"],
  "isActive": true
}
```

`PATCH /api/users/:id` accepts only `email`, `roles`, and `isActive`. It refuses to deactivate or remove `ADMIN` from the final active ADMIN account. Employee changes write business audit events such as `EMPLOYEE.CREATED`, `EMPLOYEE.UPDATED`, and `EMPLOYEE.USER_LINKED`.

### Employee avatars

Employee avatars use local development storage at `backend/uploads/avatars`. The folder is created automatically on the first upload and is ignored by Git. MongoDB stores only `avatarKey` plus MIME type, size, and timestamp; it never stores the image binary or original filename.

Both avatar endpoints require an `ADMIN` access token. Submit the image as multipart form field `file`; only genuine JPG/JPEG or PNG files up to 2 MB are accepted. The backend checks both declared MIME type and image signature before generating a UUID filename.

```http
POST /api/employees/:id/avatar
DELETE /api/employees/:id/avatar
Authorization: Bearer <admin-access-token>
```

Uploaded files are served at the safe `avatarUrl` returned in the employee payload. `AvatarStorageAdapter` is the storage boundary to replace with S3, Cloudinary, or MinIO in deployment. Avatar changes record `EMPLOYEE.AVATAR_UPDATED` or `EMPLOYEE.AVATAR_REMOVED` audit events without file content.

## Audit Logs

The backend writes business and security events to the MongoDB `audit_logs` collection. The API never accepts a client-provided actor or occurrence time. Every response includes `X-Request-Id`, which links API requests with their audit records.

Only an `ADMIN` access token can query logs:

```http
GET /api/audit-logs?page=1&limit=20&action=AUTH.LOGIN_SUCCESS
Authorization: Bearer <admin-access-token>
```

Supported query filters are `actorId`, `action`, `resourceType`, `resourceId`, `startDate`, `endDate`, `page`, and `limit`. Dates must use ISO 8601 format, for example `startDate=2026-09-01T00:00:00.000Z`.
