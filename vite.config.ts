import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { VitePWA } from 'vite-plugin-pwa';
import {defineConfig, Plugin} from 'vite';

dotenv.config();

const rootDir = typeof import.meta.dirname !== 'undefined'
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

function disableHmrClientPlugin(): Plugin {
  return {
    name: 'disable-hmr-client',
    enforce: 'post',
    transform(code: string, id: string) {
      if (id.includes('vite/dist/client/client.mjs') || id.includes('/@vite/client')) {
        return code.replace(
          /const transport = normalizeModuleRunnerTransport\(/,
          'const transport = { connect: async () => {}, disconnect: async () => {}, send: async () => {} }; const _unused_transport = normalizeModuleRunnerTransport('
        );
      }
    },
  };
}

export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  // Sanitize VITE_API_BASE_URL to prevent commentary/placeholder strings in environment from breaking client requests
  const envApiBase = process.env.VITE_API_BASE_URL;
  const validApiBase =
    envApiBase &&
    (envApiBase.startsWith('/') || /^https?:\/\//i.test(envApiBase)) &&
    !envApiBase.includes(' ') &&
    envApiBase.length < 60
      ? envApiBase
      : '/api';

  return {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(validApiBase),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'sacco-logo.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Turihamwe Management System',
          short_name: 'Turihamwe',
          description: 'Official Turihamwe Welfare & Contributions Management System for Nyamuyanja SACCO Ltd, Uganda.',
          theme_color: '#0f2744',
          background_color: '#f4f6f8',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          start_url: '/',
          scope: '/',
          orientation: 'any',
          lang: 'en',
          categories: ['finance', 'business', 'productivity'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/data\//, /^\/health$/],
          runtimeCaching: [
            {
              // Strict security rule: NEVER cache sensitive authentication, financial, member, or SMS API responses
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/auth/') ||
                url.pathname.startsWith('/data/') ||
                /^\/(login|verify|user-branches|switch-branch|logout|setup-status|setup-admin|health|branches|members|turihamwe|claims|sms|alerts|reports|system|users|roles|audit-logs|sync)(\/|$)/i.test(
                  url.pathname
                ),
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
      ...(isHmrDisabled ? [disableHmrClientPlugin()] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // Allow any host forwarded by Cloud Run or preview proxies
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !isHmrDisabled,
      ws: (isHmrDisabled ? false : undefined) as false | undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: isHmrDisabled ? null : {},
    },
    preview: {
      allowedHosts: true as const,
    },
  };
});
