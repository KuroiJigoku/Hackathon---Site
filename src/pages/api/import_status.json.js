import buildSecureHeaders from '../../lib/secure-headers.js';
import { getLast } from '../../lib/remoteImportState.js';

export const prerender = false;

export async function get(){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  const last = getLast();
  return new Response(JSON.stringify({ ok:true, last }), { status: 200, headers: { ...base, 'Content-Type':'application/json' } });
}

export const GET = get;
