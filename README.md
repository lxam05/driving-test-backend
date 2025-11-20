# Backend API for Driving Test App

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file** in the `my-backend` directory with:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

   To get your Supabase connection string:
   - Go to your Supabase project
   - Settings > Database
   - Copy the "Connection string" (URI format)
   - Replace `[YOUR-PASSWORD]` with your database password

3. **Set up the database:**
   - Go to your Supabase project
   - Open the SQL Editor
   - Run the SQL from `setup.sql` to create the `users` table

4. **Start the server:**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check
- `GET /` - Server status
- `GET /auth/ping` - Auth router test
- `GET /auth/test-db` - Test database connection

### Authentication
- `POST /auth/signup` - Create new user
  ```json
  {
    "email": "user@example.com",
    "username": "username",
    "password": "password123"
  }
  ```

- `POST /auth/login` - Login user
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

## Troubleshooting

### Database Connection Issues

1. **Check your `.env` file** - Make sure `DATABASE_URL` is set correctly
2. **Verify Supabase connection string** - Should be in format:
   `postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres`
3. **Test connection** - Visit `http://localhost:3000/auth/test-db`
4. **Check Supabase dashboard** - Ensure your project is active

### Table Not Found Error

If you get "table not found" errors:
1. Go to Supabase SQL Editor
2. Run the SQL from `setup.sql`
3. Verify the table exists in the Table Editor

### Port Already in Use

If port 3000 is taken, change `PORT` in your `.env` file to a different port (e.g., `3001`)

