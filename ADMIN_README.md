# TM Live Admin Panel

## Overview

This project now includes a separate admin web panel located at:

- `frontend/public/admin/index.html`

The admin panel allows you to:

- manage users
- ban/unban accounts
- promote/demote admin access
- view audit logs
- monitor live users, streams, and admin events in real time

## Setup

1. Install backend dependencies:

```bash
cd /Users/mac/Desktop/tm-live-platform/backend
npm install
```

2. Ensure `.env` contains a valid MongoDB connection and secret:

```text
MONGO_URI=your-mongo-connection-string
JWT_SECRET=your-strong-secret
PORT=5001
```

3. Seed an admin user:

```bash
npm run seed-admin
```

That script will create or promote the admin account and print a JWT token for use in the admin UI.

4. Start the backend:

```bash
npm start
```

5. Open the admin panel in a browser:

```text
http://localhost:5001/admin/index.html
```

## Security hardening

The backend now includes:

- `helmet` for secure HTTP headers
- `express-rate-limit` on `/api/auth`, `/api/admin`, and all `/api` traffic
- `morgan` request logging for admin and API activity
- banned-user enforcement for login and protected API routes
- admin-only Socket.IO namespace authentication

### Important

- Use a strong, unique `JWT_SECRET` in production
- Do not commit `.env` to source control
- Restrict `CORS_ORIGIN` in production if the admin panel is served from a different origin
- Run the admin panel on a private or protected subdomain if possible

## Deployment notes

For production, host the admin panel on a separate domain or subdomain such as `admin.yourdomain.com` and configure the backend:

- `CORS_ORIGIN=https://admin.yourdomain.com` or a comma-separated set of allowed origins if you need multiple hosts, for example `CORS_ORIGIN=https://admin.yourdomain.com,https://www.yourdomain.com`
- `JWT_SECRET` as a strong secret
- HTTPS termination with a trusted TLS certificate
- firewall/admin IP allow list if needed

The admin site can also run separately from the main frontend. When you open the admin panel, enter the backend API URL in the new "Backend API URL" field, for example `https://api.yourdomain.com`.

Use `socket.io` over secure WebSocket (`wss://`) in production.

## Admin socket monitoring

The admin UI connects to the `/admin` Socket.IO namespace and receives real-time updates for:

- active user counts
- live stream counts
- live events such as user join/leave, stream start/end, and viewer join/leave

This makes the admin experience immediate and easier to manage while the application runs.
