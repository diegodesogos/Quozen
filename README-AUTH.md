# Quozen Authentication and Authorization

## Overview
This document provides details about the authentication and authorization system in Quozen, including role-based access control (RBAC) and session management.

## Roles and Permissions

### Roles
- **`admin`**: Full access to all resources.
- **`member`**: Read/write access within their groups.
- **`viewer`**: Read-only access within their groups.

### API Authentication and Authorization

All API endpoints except authentication endpoints require a valid JWT token in the Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Permission Matrix
| API Endpoint                  | HTTP Method | `admin` | `member` | `viewer` | Conditions for `member`/`viewer`                  |
|-------------------------------|-------------|---------|----------|----------|---------------------------------------------------|
| `/api/users`                  | `GET`       | ✅      | ✅       | ✅       | Can only view basic info (id, name).             |
| `/api/users/:id`              | `GET`       | ✅      | ✅       | ✅       | Can only view their own profile or basic info.   |
| `/api/groups`                 | `POST`      | ✅      | ✅       | ❌       |                                                   |
| `/api/groups/:id`             | `GET`       | ✅      | ✅       | ✅       | User must be a participant in the group.         |
| `/api/groups/:id`             | `PUT`       | ✅      | ✅       | ❌       | User must be a participant in the group.         |
| `/api/users/:userId/groups`   | `GET`       | ✅      | ✅       | ✅       | `:userId` must match the authenticated user's ID.|
| `/api/groups/:groupId/expenses`| `GET`      | ✅      | ✅       | ✅       | User must be a participant in the group.         |
| `/api/expenses`               | `POST`      | ✅      | ✅       | ❌       | User must be a participant in the target group.  |
| `/api/expenses/:id`           | `GET`       | ✅      | ✅       | ✅       | User must be a participant in the expense's group.|
| `/api/expenses/:id`           | `PUT`       | ✅      | ✅       | ❌       | User must be a participant in the expense's group.|
| `/api/expenses/:id`           | `DELETE`    | ✅      | ✅       | ❌       | User must be a participant in the expense's group.|
| `/api/groups/:groupId/settlements`| `GET`   | ✅      | ✅       | ✅       | User must be a participant in the group.         |
| `/api/settlements`            | `POST`      | ✅      | ✅       | ❌       | User must be a participant in the target group.  |
| `/api/groups/:groupId/balances`| `GET`      | ✅      | ✅       | ✅       | User must be a participant in the group.         |

## Authentication System

### Token-Based Authentication
Quozen uses JSON Web Tokens (JWT) for stateless authentication:

- **Token Generation**: Server generates JWT after successful OAuth or username/password authentication
- **Token Contents**: 
  ```typescript
  interface JWTPayload {
    id: string;      // User ID
    role: Role;      // User role (admin/member/viewer)
    iat?: number;    // Issued at timestamp
    exp?: number;    // Expiration timestamp
  }
  ```
- **Token Lifetime**: 7 days by default
- **Token Storage**: Client-side in-memory state (React context, not persisted)

### Authentication Flow
1. **OAuth or Username/Password Authentication**:
   - User clicks "Sign in with Google" or enters credentials
   - OAuth or credential flow completes
   - Server creates/updates user record
   - Server generates JWT token
   - Token returned in JSON response (not via URL fragment)
   - Client stores token in memory (React state)

2. **Subsequent Requests**:
   - Client includes token in Authorization header for all API requests (handled by the AuthProvider's Axios instance)
   - Format: `Authorization: Bearer <token>`
   - Server validates token signature and expiration
   - Server attaches user data to request

3. **Error Handling**:
   - Invalid/expired tokens return 401 status
   - Missing tokens return 401 status
   - Invalid permissions return 403 status

### Security Considerations
- Tokens are stored in memory (React state) for stateless auth (do not use cookies or localStorage)
- CSRF protection via token-based auth
- XSS protection: never expose JWT in rendered HTML
- Automatic token expiration after 7 days
- Environment-specific JWT secrets

### Configuration
Required environment variables:
```bash
# Authentication
JWT_SECRET=your_secure_jwt_secret
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Optional
NODE_ENV=development|production    # Affects security settings
VERCEL_URL=your.domain.com        # For Vercel deployments
```

For implementation details, refer to:
- `server/auth.ts`: JWT implementation and OAuth configuration
- `server/authorization.ts`: Role-based access control
- `client/src/context/auth-provider.tsx`: Frontend auth state management (replaces deprecated auth-context)
- `client/src/lib/queryClient.ts`: API authentication and Axios instance

