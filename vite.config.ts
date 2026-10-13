import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';
import {defineConfig, Plugin} from 'vite';

dotenv.config();

function disableHmrClientPlugin(): Plugin {
  return {
    name: 'disable-hmr-client',
    enforce: 'post',
    transform(code: string, id: string) {
      if (id.includes('vite/dist/client/client.mjs') || id.includes('/@vite/client')) {
        return code.replace(
          /const transport = normalizeModuleRunnerTransport\(/,
          'const transport = { connect: async () => {}, disconnect: async () => {}, send: () => {} }; const _unused_transport = normalizeModuleRunnerTransport('
        );
      }
    },
  };
}

export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isHmrDisabled ? [disableHmrClientPlugin()] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !isHmrDisabled,
      ws: (isHmrDisabled ? false : undefined) as false | undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: isHmrDisabled ? null : {},
    },
  };
});
