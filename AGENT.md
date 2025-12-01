# AI Coding Agent Guidelines for Quozen

## Overview
Quozen is a mobile-first expense sharing application with a full-stack architecture. This document provides essential knowledge to help AI coding agents contribute effectively to the codebase.

## Key Conventions

### File Organization
- **Client**: React components are organized under `client/src/components` and follow a modular structure.
- **Server**: Backend logic is split into `server/routes.ts` (API routes) and `server/storage` (data layer).
- **Shared**: Shared types and schemas are located in the `shared/` directory.

### Naming Conventions
- Use `camelCase` for variables and functions.
- Use `PascalCase` for React components and classes.
- Use `kebab-case` for file and folder names.

### State Management
- Use TanStack Query for server state. Avoid using React's `useState` for global state.
- Use React Context sparingly, primarily for authentication and theming.

### Styling
- Use Tailwind CSS utility classes for styling. Avoid inline styles unless necessary.
- Use CSS variables for theming and responsive design.

## Development Workflows

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

## Integration Points

### External Dependencies
- **Google OAuth**: Set up credentials in Google Cloud Console and configure environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- **Database**: Use Neon Database for PostgreSQL in production.

### Cross-Component Communication
- Use shared schemas in `shared/` for consistent data validation across client and server.
- Use RESTful API endpoints defined in `server/routes.ts` for client-server communication.

## Examples

### Adding a New Component
1. Create a new file in `client/src/components`.
2. Use the following template:
   ```tsx
   import React from 'react';

   const MyComponent: React.FC = () => {
       return (
           <div className="p-4">
               {/* Component content */}
           </div>
       );
   };

   export default MyComponent;
   ```

### Adding a New API Route
1. Define the route in `server/routes.ts`:
   ```ts
   import { Router } from 'express';

   const router = Router();

   router.get('/new-route', (req, res) => {
       res.json({ message: 'New route' });
   });

   export default router;
   ```

2. Register the route in `server/index.ts`.

## Notes
- Follow the existing patterns and conventions in the codebase.
- Document any new features or changes in the relevant `README` or code comments.