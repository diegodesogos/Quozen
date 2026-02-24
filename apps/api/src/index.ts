import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { groupsRouter } from './routes/groups.js';

export const app = new OpenAPIHono();

// Register Security Scheme for Bearer Auth
app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT', // Optional: hints that it's a JWT token
});

// OpenAPI specification endpoint
app.doc('/api/openapi.json', {
    openapi: '3.0.0',
    info: {
        version: '1.0.0',
        title: 'Quozen API',
        description: 'Stateless Edge REST API for Quozen decentralized expense sharing'
    },
    // Apply security globally to show the "Authorize" button and lock icons
    security: [{ Bearer: [] }],
});

// Swagger UI endpoint
app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

// Mount routers
app.route('/api/v1/groups', groupsRouter);

export default app;
