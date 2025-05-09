# Eventora Backend

A Node.js backend application for event management and ticket booking system.

## Features

- User Authentication (Signup/Login)
- Role-based access control (Admin/User)
- Event Management (CRUD operations)
- Event Search and Filtering
- Ticket Booking System
- User Profile Management
- Image Upload Support
- Pagination for List APIs

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Cloudinary account (for image upload)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd eventora-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/eventora
JWT_SECRET=your_jwt_secret_key_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

4. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- POST `/api/auth/signup` - Register a new user
- POST `/api/auth/login` - Login user

### Events
- GET `/api/events` - Get all events (with pagination and filters)
- GET `/api/events/:id` - Get single event
- POST `/api/events` - Create new event (Admin only)
- PUT `/api/events/:id` - Update event (Admin only)
- DELETE `/api/events/:id` - Delete event (Admin only)

### Bookings
- POST `/api/bookings` - Create new booking
- GET `/api/bookings/my-bookings` - Get user's bookings
- GET `/api/bookings/:id` - Get booking details
- PUT `/api/bookings/:id/cancel` - Cancel booking

### User Profile
- GET `/api/users/profile` - Get user profile
- PUT `/api/users/profile` - Update user profile
- PUT `/api/users/change-password` - Change password

## Query Parameters for Event Search

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `search` - Search term for event name/description
- `category` - Filter by category
- `minPrice` - Minimum price filter
- `maxPrice` - Maximum price filter
- `date` - Filter by date (events after this date)

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Security

- Passwords are hashed using bcrypt
- JWT authentication for protected routes
- Input validation using express-validator
- File upload size limits
- Role-based access control

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 