# Watcher Railway - 42 Intra Backend API

Railway backend API with 42 Intra authentication and Couchbase (Ottoman ODM) database.

## Features

- **42 Intra Authentication**: All API routes are protected with Bearer token authentication via `https://api.intra.42.fr/v2/me`
- **Couchbase + Ottoman**: Uses Ottoman ODM (Object Document Mapper) for Couchbase database operations
- **Express.js**: Fast, minimalist web framework
- **CORS Enabled**: Cross-Origin Resource Sharing support

## API Routes

All routes require authentication via `Authorization: Bearer <token>` header.

### `/health`
- **Method**: GET
- **Auth**: Not required
- **Description**: Health check endpoint

### `/api/dashboard?campusId={campusId}`
- **Method**: GET
- **Auth**: Required
- **Query Params**: 
  - `campusId` (optional): Filter by campus ID, use "all" for all campuses
- **Description**: Get comprehensive dashboard statistics including:
  - Top project submitters (current month)
  - Top location stats (current month)
  - All-time projects leaders
  - All-time wallet leaders
  - All-time correction points leaders
  - All-time levels leaders
  - Grade distribution
  - Hourly occupancy (24-hour format)
  - Weekly occupancy (Mon-Sun)

### `/api/students`
- **Method**: GET
- **Auth**: Required
- **Query Params**: 
  - `search` (optional): Search in login, first_name, last_name
  - `pool` (optional): Filter by pool (e.g., "january-2024")
  - `grade` (optional): Filter by grade
  - `active` (optional): Filter by active status ("true" / "false")
  - `campusId` (optional): Filter by campus ID
  - `sort` (optional): Sort field ("level", "wallet", "correction_point", "login")
  - `order` (optional): Sort order ("asc" / "desc")
  - `limit` (optional): Number of results (default: 50)
  - `skip` (optional): Pagination offset (default: 0)
- **Description**: Get list of students with advanced filtering and pagination

### `/api/students/:login`
- **Method**: GET
- **Auth**: Required
- **Description**: Get specific student by login with:
  - Student details
  - Projects list
  - Location statistics
  - Feedbacks received
  - Patronage relationships (patron and patroned students)

### `/api/students/pools?campusId={campusId}`
- **Method**: GET
- **Auth**: Required
- **Query Params**: 
  - `campusId` (optional): Filter by campus ID
- **Description**: Get students grouped by pools with counts

### `/api/user/me`
- **Method**: GET
- **Auth**: Required
- **Description**: Get current authenticated user information from 42 Intra

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd watcher_railway
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from example:
```bash
copy .env.example .env
```

4. Configure your environment variables in `.env`:
```env
PORT=3000
COUCHBASE_CONNECTION_STRING=couchbase://localhost
COUCHBASE_USERNAME=Administrator
COUCHBASE_PASSWORD=password
COUCHBASE_BUCKET=students
```

## Running the Application

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 3000).

## Authentication

All protected routes require a valid 42 Intra Bearer token in the Authorization header:

```bash
curl -H "Authorization: Bearer <your_42_token>" http://localhost:3000/api/user/me
```

The middleware validates the token by making a request to `https://api.intra.42.fr/v2/me`. The user data is attached to the request object for use in routes.

## Couchbase Collections

The application uses the following collections with Ottoman ODM:

### 1. **students**
Main student information from 42 API.

```javascript
{
  id: Number,              // 42 user ID
  login: String,
  email: String,
  first_name: String,
  last_name: String,
  displayname: String,
  usual_full_name: String,
  pool_month: String,
  pool_year: String,
  wallet: Number,
  correction_point: Number,
  level: Number,
  "active?": Boolean,
  grade: String,
  campusId: Number,
  image: {
    link: String,
    versions: { large, medium, small, micro }
  }
}
```

### 2. **projects**
Student project submissions and results.

```javascript
{
  id: Number,
  campusId: Number,
  login: String,
  name: String,
  slug: String,
  final_mark: Number,
  status: String,
  "validated?": Boolean,
  date: String
}
```

### 3. **locationstats**
Cluster location/host usage tracking.

```javascript
{
  id: Number,
  login: String,
  campusId: Number,
  host: String,
  begin_at: String,
  end_at: String
}
```

### 4. **feedbacks**
Evaluation feedbacks received by students.

```javascript
{
  id: Number,
  login: String,
  campusId: Number,
  rating: Number,
  comment: String,
  final_mark: Number,
  created_at: String
}
```

### 5. **patronages**
Mentor-mentee (godfather-child) relationships.

```javascript
{
  id: Number,
  user_id: Number,
  user_login: String,
  godfather_id: Number,
  godfather_login: String,
  campusId: Number
}
```

## Ottoman Indexes

Ottoman automatically creates indexes defined in the models:

- **students**: login, campusId, pool, grade, level, wallet, correction_point
- **projects**: login, campusId, date
- **locationstats**: login, campusId, begin_at
- **feedbacks**: login, campusId, created_at
- **patronages**: user_login, godfather_login, campusId

## Project Structure

```
watcher_railway/
├── src/
│   ├── config/
│   │   └── database.js         # Ottoman connection configuration
│   ├── middleware/
│   │   └── auth.js             # 42 Intra authentication middleware
│   ├── models/
│   │   └── index.js            # Ottoman models (Student, Project, etc.)
│   ├── routes/
│   │   ├── dashboard.js        # Dashboard API
│   │   ├── students.js         # Students API
│   │   └── user.js             # User API
│   └── index.js                # Main application entry point
├── example/
│   └── models.js               # Reference models from database update
├── .env.example                # Example environment variables
├── .gitignore
├── package.json
└── README.md
```

## Deployment on Railway

1. Push your code to GitHub
2. Connect your repository to Railway
3. Add environment variables in Railway dashboard:
   - `PORT` (Railway will set this automatically)
   - `COUCHBASE_CONNECTION_STRING`
   - `COUCHBASE_USERNAME`
   - `COUCHBASE_PASSWORD`
   - `COUCHBASE_BUCKET`
4. Deploy!

## Security

All user inputs are validated and sanitized to prevent:
- SQL/NoSQL Injection attacks
- XSS (Cross-Site Scripting)
- Type confusion attacks
- Resource exhaustion / DoS
- Path traversal

### Input Validation
- **Campus ID**: Integer validation (0-999999)
- **Login**: Alphanumeric + hyphens/underscores only (max 50 chars)
- **Search**: Special characters removed (max 100 chars)
- **Pool**: Format validation (month-year, 2000-2100)
- **Sort fields**: Whitelist-based validation
- **Pagination**: Max limit 500, max skip 100000

See [SECURITY.md](./SECURITY.md) for detailed security implementation.

## Performance Notes

- Dashboard API: Optimized queries with in-memory aggregation
- Student List: Client-side filtering for search (consider N1QL for production)
- Student Detail: Parallel queries for related data
- All queries use Ottoman's built-in indexes

## Error Responses

All errors return consistent JSON format:
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

HTTP Status Codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Internal Server Error

## License

ISC