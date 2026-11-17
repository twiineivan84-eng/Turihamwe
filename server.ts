import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config';
import { serverStore } from './src/server/storage/serverStore';
import { SeedService } from './src/server/services/seedService';
import { authRouter } from './src/server/routes/authRoutes';
import { branchRouter } from './src/server/routes/branchRoutes';
import { auditRouter } from './src/server/routes/auditRoutes';
import { userRouter } from './src/server/routes/userRoutes';
import { syncRouter } from './src/server/routes/syncRoutes';
import { memberRouter } from './src/server/routes/memberRoutes';
import { turihamweRouter } from './src/server/routes/turihamweRoutes';
import { claimRouter } from './src/server/routes/claimRoutes';
import { smsRouter } from './src/server/routes/smsRoutes';
import { alertRouter } from './src/server/routes/alertRoutes';
import { reportRouter } from './src/server/routes/reportRoutes';
import { systemRouter } from './src/server/routes/systemRoutes';
import { smsQueueWorker } from './src/server/services/smsQueueWorker';
import { scheduledBackupWorker } from './src/server/services/scheduledBackupWorker';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port 3000 is required internally (config.app.port maps container PORT=8080 to 3000 while allowing explicit test ports)
const PORT = config.app.port;
const isProd = config.app.isProduction;

async function bootstrap() {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: `${config.storage.maxUploadSizeMb}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.storage.maxUploadSizeMb}mb` }));

  // Normalize consecutive slashes in request URLs to prevent Express routing 404s
  app.use((req, _res, next) => {
    if (req.url && req.url.includes('//')) {
      req.url = req.url.replace(/\/{2,}/g, '/');
    }
    next();
  });

  // CORS middleware (Requirement 12)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = config.app.corsAllowedOrigins;
    const requestHost = req.get('host');
    const isSameHostOrigin = Boolean(
      origin &&
        requestHost &&
        (origin === `https://${requestHost}` || origin === `http://${requestHost}`)
    );

    if (config.app.isDevelopment || !origin) {
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowed.includes(origin) || allowed.includes('*') || isSameHostOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Security: Protect internal database, backups, and confidential storage from public web access
  app.use(['/data', '/data/*'], (_req, res) => {
    res.status(403).json({ error: 'Access forbidden: internal data repositories are protected from public web access.' });
  });

  // Initialize persistence and validate non-operational reference configuration
  await serverStore.initialize();
  await SeedService.ensureReferenceConfiguration();

  // Start background Pandora SMS Queue Worker
  smsQueueWorker.start();

  // Start background Automated Midnight Backup Worker (00:00 Africa/Kampala)
  scheduledBackupWorker.start();

  // Direct authentication endpoints for root and /api shortcuts to prevent any 404s
  app.all(['/login', '/api/login'], (req, res, next) => {
    req.url = '/login' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/verify', '/api/verify'], (req, res, next) => {
    req.url = '/verify' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/user-branches', '/api/user-branches'], (req, res, next) => {
    req.url = '/user-branches' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/switch-branch', '/api/switch-branch'], (req, res, next) => {
    req.url = '/switch-branch' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/logout', '/api/logout'], (req, res, next) => {
    req.url = '/logout' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/setup-status', '/api/setup-status'], (req, res, next) => {
    req.url = '/setup-status' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });
  app.all(['/setup-admin', '/api/setup-admin'], (req, res, next) => {
    req.url = '/setup-admin' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    authRouter(req, res, next);
  });

  // Mount API endpoints (Support both /api/* and root /* paths to prevent 404s)
  app.use(['/api/auth', '/auth'], authRouter);
  app.use(['/api/branches', '/branches'], branchRouter);
  app.use(['/api/audit-logs', '/audit-logs'], auditRouter);
  app.use(['/api/users', '/users'], userRouter);
  app.use(['/api/sync', '/sync'], syncRouter);
  app.use(['/api/members', '/members'], memberRouter);
  app.use(['/api/turihamwe', '/turihamwe'], turihamweRouter);
  app.use(['/api/claims', '/claims'], claimRouter);
  app.use(['/api/sms', '/sms'], smsRouter);
  app.use(['/api/alerts', '/alerts'], alertRouter);
  app.use(['/api/reports', '/reports'], reportRouter);
  app.use(['/api/system', '/system'], systemRouter);

  // Production Health Check & Monitoring (Requirement 7 & 15)
  app.get(['/health', '/api/health'], (_req, res) => {
    const branches = serverStore.getBranches();
    const members = serverStore.getMembers();
    const users = serverStore.getUsers();
    const syncRecords = serverStore.getSyncRecords();
    const pendingSync = syncRecords.filter(r => r.status === 'PENDING').length;
    const smsMessages = serverStore.getSmsMessages();

    res.json({
      status: serverStore.isDatabaseHealthy() ? 'ONLINE' : 'DEGRADED',
      system: 'Turihamwe Management System',
      organization: 'Nyamuyanja SACCO Ltd, Uganda',
      version: '1.0.0-phase9',
      environment: config.app.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      components: {
        database: {
          status: serverStore.isDatabaseHealthy() ? 'HEALTHY' : 'ERROR',
          mode: 'Local_Transactional_Journal',
          branchesCount: branches.length,
          usersCount: users.length,
          membersCount: members.length,
        },
        sqliteOffline: {
          status: 'READY',
          path: config.database.sqlitePath,
          pendingSyncCount: pendingSync,
        },
        storage: {
          status: 'ONLINE',
          maxUploadSizeMb: config.storage.maxUploadSizeMb,
        },
        sms: {
          status: config.sms.enabled ? 'ONLINE' : 'DISABLED',
          provider: 'PANDORA',
          senderId: config.sms.senderId,
          workerStatus: smsQueueWorker.getStatus(),
          configurationStatus: smsQueueWorker.getDiagnostics().configurationStatus,
          pendingMessages: smsMessages.filter(m => m.status === 'PENDING').length,
          sentMessages: smsMessages.filter(m => m.status === 'SENT').length,
          failedMessages: smsMessages.filter(m => m.status === 'FAILED').length,
        },
        backup: {
          enabled: config.backup.enabled,
          storageConfigured: true,
          workerStatus: scheduledBackupWorker.isRunning() ? 'RUNNING' : 'STOPPED',
          scheduleTimeKampala: '00:00 (Midnight EAT / UTC+03:00)',
          timezone: 'Africa/Kampala',
          lastBackupFilename: scheduledBackupWorker.getStatus().lastBackupFilename,
          nextScheduledTimeUganda: scheduledBackupWorker.getStatus().nextScheduledTimeUganda,
        },
        sync: {
          enabled: config.sync.enabled,
          intervalSeconds: config.sync.intervalSeconds,
        },
      },
    });
  });

  // Explicit API 404 handler: prevents unmatched API routes from falling through to the SPA HTML handler
  app.all(['/api', '/api/*'], (_req, res) => {
    res.status(404).json({ success: false, message: 'Requested API endpoint not found (HTTP 404).' });
  });

  // Frontend integration
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.resolve(distPath, 'index.html'));

  if (isProd && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : undefined,
        ws: (isHmrDisabled ? false : undefined) as false | undefined,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TURIHAMWE SACCO] Server online on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log('[TURIHAMWE SACCO] Server shutting down, terminating background workers...');
    smsQueueWorker.stop();
    scheduledBackupWorker.stop();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

bootstrap().catch(err => {
  console.error('[FATAL] Failed to bootstrap Turihamwe Management System:', err);
  process.exit(1);
});
