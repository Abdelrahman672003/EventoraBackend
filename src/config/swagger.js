const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Eventora API Documentation',
      version: '1.0.0',
      description: 'API documentation for Eventora - Event Management System',
      contact: {
        name: 'API Support',
        email: 'support@eventora.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./src/routes/*.js'] // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = specs; 