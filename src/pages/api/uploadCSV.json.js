// Deprecated: CSV upload endpoint removed. Return 410 Gone for all methods.
export const prerender = false;
const baseHeaders = { 'Content-Type': 'application/json' };
export async function get(){
  return new Response(JSON.stringify({ message: 'This endpoint has been removed. Use /api/import_remote.json' }), { status: 410, headers: baseHeaders });
}
export async function post(){
  return new Response(JSON.stringify({ message: 'This endpoint has been removed. Use /api/import_remote.json' }), { status: 410, headers: baseHeaders });
}
export const GET = get;
export const POST = post;

