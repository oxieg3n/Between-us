// Bundle with npm run build; never embed the service key in an application bundle.
import { createApi, mountEdgeApi } from '../_shared/api.bundle.js';
Deno.serve(mountEdgeApi(createApi({ url: Deno.env.get('SUPABASE_URL'), publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), syntheticLocal: false })));
