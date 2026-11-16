import { build } from 'esbuild';
await build({ entryPoints: ['src/api.ts'], outfile: 'supabase/functions/_shared/api.bundle.js', bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], target: 'es2023', legalComments: 'eof' });
