import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['quill'] // Explicitly tell Vite to pre-bundle quill
  },
  build: {
    rollupOptions: {
      // If bundling still fails, uncommenting 'external' might be needed,
      // but ideally Vite handles the bundling.
      external: ['quill']
    }
  }
  // No specific config needed by default, Vite should handle CJS dependencies.
  // If the error persists, uncommenting optimizeDeps might help.
});
