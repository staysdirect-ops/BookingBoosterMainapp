// Serves the free guide PDFs (static files of this function, see supabase/config.toml).
// The main function "bb" fetches them for /guides/<name>.pdf, so visitors stay on booking-booster.co.uk.
const NAME = 'guides-a';
async function read(name: string): Promise<Uint8Array | null> {
  const tries = [new URL('./files/' + name, import.meta.url), './functions/' + NAME + '/files/' + name, './files/' + name, '/home/deno/functions/' + NAME + '/files/' + name];
  for (const p of tries) { try { return await Deno.readFile(p); } catch (_) { /* next */ } }
  return null;
}
Deno.serve(async req => {
  const name = new URL(req.url).pathname.split('/').pop() || '';
  if (!/^[a-z0-9-]+\.pdf$/.test(name)) return new Response('Not found', { status: 404 });
  const data = await read(name);
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(data, { headers: { 'content-type': 'application/pdf', 'cache-control': 'public, max-age=86400' } });
});
