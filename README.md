# Quozen: Expense Sharing Mobile App

## Overview
Quozen is a mobile-first expense sharing application built with React, TypeScript, and Express.js. It allows users to create groups, track shared expenses, calculate balances, and settle debts between group members. The app features a clean, modern UI optimized for mobile devices.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, built using Vite.
- **UI Components**: Shadcn/ui components based on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables for theming.
- **State Management**: TanStack Query for server state and caching.
- **Routing**: Wouter for lightweight client-side routing.
- **Mobile-First Design**: Optimized for mobile with responsive layouts and touch-friendly interfaces.

### Backend
- **Framework**: Express.js with TypeScript.
- **Data Storage**: In-memory storage for development; PostgreSQL schema defined using Drizzle ORM.
- **Authentication**: Google OAuth 2.0 via Passport.js.
- **API Design**: RESTful JSON API with consistent error handling.

### Shared Code
- **Schemas**: Shared between client and server using Drizzle ORM and Zod for validation.
- **Utilities**: Common utilities for data manipulation and validation.

## Key Features

- **Expense Splitting**: Flexible splitting system allowing custom amounts per user with automatic validation.
- **Balance Calculation**: Real-time balance computation showing who owes whom and settlement suggestions.
- **Group Management**: Multi-user groups with participant management and expense categorization.
- **Settlement Tracking**: Record and track debt settlements between users with multiple payment methods.

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Access the app at `http://localhost:3000`.

### Testing
- Unit tests are written using Jest. Run tests with:
  ```bash
  npm run test
  ```

### Building for Production
- Build the client and server:
  ```bash
  npm run build
  ```
- Start the production server:
  ```bash
  npm run start
  ```

## Authentication and Authorization

Quozen uses a robust authentication and authorization system with role-based access control (RBAC). For detailed information about roles, permissions, and session management, refer to the [Authentication and Authorization README](README-AUTH.md).


### Authentication
Quozen uses JWT (JSON Web Tokens) for authentication, supporting both Google OAuth 2.0 and username/password login. All API requests are made using an Axios instance provided by the AuthProvider (`axiosWithAuth`), which automatically attaches the JWT from in-memory state to the Authorization header.

- **Setup Requirements**:
  1. Create credentials in [Google Cloud Console](https://console.cloud.google.com/):
     - Enable Google OAuth API.
     - Create OAuth 2.0 Client ID (Web Application type).
     - Add authorized redirect URIs:
       - Local: `http://localhost:5001/api/auth/google/callback`
       - Production: `https://your-domain.com/api/auth/google/callback`
  2. Set environment variables:
     ```bash
     GOOGLE_CLIENT_ID=your_client_id
     GOOGLE_CLIENT_SECRET=your_client_secret
     JWT_SECRET=your_secure_jwt_secret
     ```

- **Authentication Flow**:
  1. User initiates Google OAuth login or registers with username/password
  2. After successful authentication, server generates a JWT token
  3. Token is returned in the JSON response
  4. Frontend stores token in memory (React state) and includes it in the Authorization header for all API requests (handled by the AuthProvider's Axios instance)
  5. Protected routes verify token validity

### Authorization
- **Role-Based Access Control (RBAC)**:
  - `admin`: Full access to all resources.
  - `member`: Read/write access within their groups.
  - `viewer`: Read-only access within their groups.

## External Dependencies

- **Database**: Neon Database for PostgreSQL in production.
- **UI Libraries**: Radix UI, Tailwind CSS, Lucide React.
- **State Management**: TanStack Query, React Hook Form.
- **API Requests**: Axios (with centralized instance and JWT handling)

## Deployment

### Vercel Deployment
- Use `vercel.json` for configuration.
- Ensure environment variables are set for production.

### Google Sheets Integration
- Follow the setup guide in `server/storage/README.md` for Google Sheets storage.

## Storage System

The storage system in Quozen supports multiple implementations, including in-memory storage, PostgreSQL, Supabase, and Google Sheets. It uses a factory pattern to dynamically select the appropriate storage type based on the environment.

For detailed setup and configuration instructions, refer to the [Storage System README](server/storage/README.md).

## File Structure

```
├── client/              # React frontend
│   ├── src/            # React source code
│   └── index.html      # HTML template
├── server/             # Express backend
│   ├── index.ts        # Main server file
│   ├── routes.ts       # API routes
│   └── storage/        # Data layer
├── shared/             # Shared types/schemas
├── api/                # React frontend
│   ├── index.js        # Cloud deployment entry point for backend (specifically for Vercel's automatic conversion to Functions)
├── dist/               # Built files (generated)
│   ├── client/         # Built React app
│   └── server/         # Built Express app
└── package.json        # Root package.json
```