# BARMAN STORE REACT

Full-stack store, billing, purchase, credit, and inventory management app built with React + Vite (frontend) and Node.js + Express + SQLite (backend).

## Tech Stack
- Frontend: React 18, React Router, Vite, Lucide React
- Backend: Node.js, Express, CORS, bcrypt
- Database: SQLite via `better-sqlite3`

## Project Structure
- `src/` frontend source
- `server/index.js` API server and DB initialization
- `server/barman-store.db` SQLite file (auto-created)
- `vite.config.js` Vite dev server config

## Prerequisites
- Node.js 18+
- npm

## Local Setup
1. Install dependencies
- `npm install`

2. Start backend (terminal 1)
- `npm run server`

3. Start frontend (terminal 2)
- `npm run dev`

4. Open app
- `http://localhost:3000/`

## LAN Setup
1. Start backend and frontend on the host machine.
2. Find host IP (Windows): `ipconfig`
3. Open from another device on same network:
- `http://<HOST_IP>/`
4. Allow firewall inbound ports:
- `3000` (frontend dev via Vite)
- `80` (frontend production via IIS/Nginx)
- `5000` (backend)

## Environment Variables
Supported by backend (`server/index.js`):

- `PORT`
  - Default: `5000`
  - Backend listen port
- `DB_PATH`
  - Default: `server/barman-store.db`
  - SQLite DB file path
- `FRONTEND_ORIGIN`
  - Optional CORS allowlist, supports comma-separated origins
  - Example: `http://localhost:3000,http://127.0.0.1,http://192.168.1.20:3000`
- `BCRYPT_SALT_ROUNDS`
  - Default: `10`
  - Password hashing cost
- `BACKUP_DIR`
  - Default: `server/backups`
  - Backup files directory
- `AUTO_BACKUP_ENABLED`
  - Default: `false`
  - Enables periodic automatic DB backups when `true`
- `AUTO_BACKUP_INTERVAL_MINUTES`
  - Default: `360`
  - Interval between automatic backups
- `AUTO_BACKUP_ON_STARTUP`
  - Default: `false`
  - If `true`, performs one automatic backup at server startup
- `AUTO_BACKUP_RETENTION_COUNT`
  - Default: `30`
  - Maximum number of auto backups to keep (`0` means unlimited)
- `AUTO_BACKUP_RETENTION_DAYS`
  - Default: `30`
  - Maximum age in days for auto backups (`0` means unlimited)

## Scripts
- `npm run dev` start Vite dev server
- `npm run server` start Express API server
- `npm run build` build frontend
- `npm run preview` preview frontend build
- `npm run pm2:start` start backend via PM2 using `ecosystem.config.cjs`
- `npm run pm2:restart` restart PM2 backend app
- `npm run pm2:logs` view PM2 logs for backend app

## Default Admin Login
- Email: `admin@admin.com`
- Password: `admin123`

## API Reference
Base URL: `http://localhost:5000`

### System
- `GET /` API status
- `POST /api/notify-order/:orderId`

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/change-password`
- `POST /api/auth/request-password-reset`

### Admin Password Reset
- `GET /api/admin/password-reset-requests`
- `PUT /api/admin/password-reset-requests/:id`

### Admin Backup
- `POST /api/admin/backup/create`
- `GET /api/admin/backup/status`
- `GET /api/admin/backup/list`
- `GET /api/admin/backup/download/:fileName`
- `POST /api/admin/backup/restore`

### Users and Customers
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `GET /api/customers`
- `GET /api/customers/search`
- `GET /api/customers/:id/profile`

### Products and Categories
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/category/:category`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

### Orders
- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/:id/history`
- `GET /api/orders/number/:orderNumber`
- `GET /api/users/:userId/orders`
- `POST /api/orders`
- `POST /api/orders/create-validated`
- `POST /api/orders/validate-customer`
- `PUT /api/orders/:id/status`

### Stats
- `GET /api/stats/orders`

### Credit
- `GET /api/users/:userId/credit-history`
- `GET /api/users/:userId/credit-balance`
- `POST /api/users/:userId/credit`
- `POST /api/credit/check-limit`
- `GET /api/credit/aging`

### Distributors
- `GET /api/distributors`
- `GET /api/distributors/:id`
- `POST /api/distributors`
- `PUT /api/distributors/:id`
- `DELETE /api/distributors/:id`

### Purchase Orders
- `GET /api/purchase-orders`
- `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders`
- `PUT /api/purchase-orders/:id`
- `PUT /api/purchase-orders/:id/status`
- `POST /api/purchase-orders/:id/receive`
- `DELETE /api/purchase-orders/:id`

### Purchase Returns
- `GET /api/purchase-returns`
- `GET /api/purchase-returns/:id`
- `POST /api/purchase-returns`
- `PUT /api/purchase-returns/:id`
- `DELETE /api/purchase-returns/:id`

### Stock
- `GET /api/stock-ledger`
- `GET /api/stock-ledger/product/:productId`
- `GET /api/stock-ledger/batch/:batchNumber`
- `GET /api/stock-ledger/summary`
- `POST /api/stock/verify`

### Billing
- `GET /api/billing/customers/search`
- `GET /api/billing/products/search`
- `POST /api/bills/create`
- `GET /api/bills`
- `GET /api/bills/:id`
- `PUT /api/bills/:id/payment`
- `GET /api/bills/stats/summary`

### Offers
- `GET /api/offers`
- `POST /api/offers`
- `PUT /api/offers/:id`
- `DELETE /api/offers/:id`

### Placeholder / Stub Endpoints
(Currently return empty/default responses in backend)
- `GET /api/product-versions/:internalId`
- `GET /api/product-versions/sku/:sku`
- `GET /api/uom-conversions/:productId`
- `POST /api/uom-conversions`
- `DELETE /api/uom-conversions/:id`
- `GET /api/batch-stock`
- `POST /api/batch-stock`

## Production Deployment

### Option 1: Same machine, static frontend + Node backend
1. Build frontend
- `npm run build`

2. Serve `dist/` with Nginx/IIS/Apache, or Vite preview (not recommended for production)
- `npm run preview`

3. Run backend on host
- `node server/index.js`

### Option 2: PM2 process manager
1. Install PM2
- `npm i -g pm2`

2. Start backend
- `pm2 start server/index.js --name barman-api`

3. Persist across reboot
- `pm2 save`
- `pm2 startup`

4. Useful commands
- `pm2 status`
- `pm2 logs barman-api`
- `pm2 restart barman-api`
- Or use project scripts:
- `npm run pm2:start`
- `npm run pm2:restart`
- `npm run pm2:logs`

### Option 2A: Ready config files in this repo
- IIS rewrite template: `public/web.config` (copied to `dist/web.config` on build)
- PM2 config: `ecosystem.config.cjs`
- Nginx site config template: `nginx/barman-store.conf`

### Option 3: Windows Service (backend)
Use NSSM to run Node backend as service.

1. Install NSSM
2. Create service:
- Application: `node.exe`
- Arguments: `server/index.js`
- Startup dir: project root
3. Set environment variables (`PORT`, `DB_PATH`, `FRONTEND_ORIGIN`) in service config.
4. Start service and configure auto-start.

### Option 4: Windows Installer (`Setup.exe`) flow
Typical packaging flow:
1. Build frontend (`dist`)
2. Package backend runtime (plain Node app or bundled exe)
3. Use Inno Setup / NSIS / WiX to create installer
4. Installer should:
- copy app files
- configure/start backend service
- create shortcuts
- add uninstall entry

## Operational Notes
- Keep `server/` writable so SQLite can create/update DB.
- Back up `server/barman-store.db` regularly.
- If running over LAN, set `FRONTEND_ORIGIN` to allowed hosts for stricter CORS.
- Frontend routes include public pages and admin views; admin access is role-based.

