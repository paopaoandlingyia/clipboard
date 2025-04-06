import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['quill'] // Keep this, helps Vite dev server and discovery
  },
  build: {
    commonjsOptions: {
      // This sometimes helps Rollup handle complex CJS dependencies like Quill
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Ensure quill is NOT externalized, so remove or keep commented:
      //     // external: ['quill']
    }, // <-- Added comma here
  }
  // No specific config needed by default, Vite should handle CJS dependencies.
  // If the error persists, uncommenting optimizeDeps might help.
});
