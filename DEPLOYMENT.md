# Turihamwe Management System — Production & PWA Deployment Guide
**Institution:** Nyamuyanja SACCO Ltd, Isingiro District, Uganda

## 1. Prerequisites
- Node.js 20 LTS or newer
- Persistent host directory for SACCO database, claim attachments, and automated backups (e.g., `/var/lib/turihamwe/data` on Linux or `D:\NyamuyanjaSACCO\TurihamweData` on Windows)
- HTTPS reverse proxy (Nginx, Caddy, Cloudflare, or IIS) serving the application over TLS (`https://`) — **required by Chrome and Microsoft Edge for production PWA installation outside localhost**

## 2. Production Environment Configuration
Copy `.env.example` to `.env` (or inject via systemd/Docker/Windows environment variables) and configure real institutional values:

```env
NODE_ENV=production
PORT=3000
DISABLE_HMR=true
STRICT_PROD_CONFIG=true

APP_URL=https://turihamwe.nyamuyanjasacco.ug
CORS_ALLOWED_ORIGINS=https://turihamwe.nyamuyanjasacco.ug

# Generate with: openssl rand -hex 32
JWT_SECRET=<REPLACE_WITH_MIN_32_CHAR_RANDOM_SECRET>
JWT_EXPIRY=12h

# Durable data storage outside deployment folder (never overwritten on code updates)
TUR_PERSISTENT_DATA_DIR=/var/lib/turihamwe/data

# Exclusive SMS Provider: Pandora Networks
SMS_PROVIDER=PANDORA
SMS_ENABLED=true
PANDORA_SMS_PHONE_NUMBER=2567XXXXXXXX
PANDORA_SMS_PASSWORD=<YOUR_PANDORA_PASSWORD>
PANDORA_SMS_SENDER_ID=NYAMUYANJA
```

> **Security Notes**
> - Do not commit `.env` to version control.
> - Set `STRICT_PROD_CONFIG=true` in production so the server rejects startup if `JWT_SECRET` uses a development placeholder.
> - Never clear, reseed, or run `db:clear` against `TUR_PERSISTENT_DATA_DIR` in production.

## 3. Build & Start
```bash
npm ci
npm run build
npm test
npm start
```
The production server serves the compiled PWA frontend (`dist/`), Service Worker (`/sw.js`), Web App Manifest (`/manifest.webmanifest` and `/manifest.json`), and backend REST API on port `3000`.

## 4. HTTPS Reverse Proxy (Nginx Example)
```nginx
server {
    listen 443 ssl http2;
    server_name turihamwe.nyamuyanjasacco.ug;

    ssl_certificate     /etc/letsencrypt/live/turihamwe.nyamuyanjasacco.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/turihamwe.nyamuyanjasacco.ug/privkey.pem;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Notice the server enables `app.set('trust proxy', 1)` and allows `X-Working-Branch` in CORS headers cleanly.

## 5. Installing as a Desktop / Branch Workstation PWA on Windows
Once served over HTTPS (or `http://localhost:3000`):
1. Open the application in **Microsoft Edge** or **Google Chrome**.
2. Click the in-app **Install App** button (or the browser address bar install icon):
   - **Microsoft Edge:** Menu (`...`) -> **Apps** -> **Install this site as an app**.
   - **Google Chrome:** Menu (`⋮`) -> **Save and share** -> **Install page as app**.
3. Confirm **Install**. Windows creates a Desktop shortcut and Start Menu entry (`Turihamwe Management System`), launching the application in a clean standalone window.
4. Updates roll out automatically via the service worker (`autoUpdate`) without erasing IndexedDB branch queues (`Turihamwe_Branch_LocalDB`) or active authentication state.

## 6. Offline Operations & Data Protection
- **Cached by Service Worker:** Static UI shell (HTML, JS bundles, CSS, institutional icons).
- **Never Cached by Service Worker (`NetworkOnly`):** All `/api/*`, authentication, member, financial, and SMS API responses are strictly `NetworkOnly`.
- **Offline Operations:** Installed UI loads cleanly offline; branch operations queued via IndexedDB sync once internet returns with duplicate receipt/reference protection (`syncRoutes`).
- **Online Required:** Initial login verification, live server backups, and Pandora SMS dispatch require active internet connectivity.
- **Database Recovery Mode:** If `turihamwe_central_db.json` is missing or corrupted, the server stops operational routes cleanly (HTTP `503`), refuses to initialize a blank database over production data, and renders a clear recovery screen for IT staff.
