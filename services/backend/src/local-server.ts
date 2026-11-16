import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApi } from './api.ts';
const values = JSON.parse(await readFile(new URL('../.local/status.json', import.meta.url), 'utf8').then(s => s.replace(/^\uFEFF/, '')));
const handle = createApi({ url: values.API_URL, publicKey: values.ANON_KEY, serviceKey: values.SERVICE_ROLE_KEY, syntheticLocal: true });
createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost):8787$/.test(host)) { outgoing.writeHead(403); outgoing.end(); return; }
    // Loopback only. Do not trust proxy headers or expose this synthetic development adapter publicly.
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of incoming) { size += chunk.length; if (size > 8192) { outgoing.writeHead(413); outgoing.end(); return; } chunks.push(chunk); }
    const request = new Request(`http://${host}${incoming.url}`, { method: incoming.method,
      headers: new Headers(Object.entries(incoming.headers).flatMap(([key, value]) => value ? [[key, Array.isArray(value) ? value.join(',') : value]] : [])),
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    const response = await handle(request); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(503); outgoing.end('{"error":"Service unavailable."}'); }
}).listen(8787, '127.0.0.1', () => process.stdout.write('Between Us synthetic API: http://127.0.0.1:8787 (not public)\n'));
