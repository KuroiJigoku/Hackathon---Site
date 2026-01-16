// API route: POST /api/logout
// Clears the auth cookie on the client side
import buildSecureHeaders from '../../lib/secure-headers.js';
export const prerender = false;

export async function post({ request }){
  // Always clear cookie client-side
  const isSecure = (process.env.NODE_ENV === 'production');
  
  // Create a cookie string that expires immediately
  const cookieParts = [ 
    `sa_token=deleted`, 
    `HttpOnly`, p
    `Path=/`, 
    `Max-Age=0`, 
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`, 
    `SameSite=Strict` 
  ];
  
  if(isSecure) cookieParts.push('Secure');

  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  const headers = new Headers({ ...base, 'Content-Type': 'application/json' });
  
  // Set-Cookie header instructs the browser to delete the token
  headers.append('Set-Cookie', cookieParts.join('; '));

  return new Response(JSON.stringify({ message: 'logged out' }), { status: 200, headers });
}

export async function get({ request }){
  // Allow GET logout in non-production (convenience for curl/dev).
  if(process.env.NODE_ENV !== 'production'){
    return await post({ request }).catch(()=>{
      const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
      return new Response(JSON.stringify({ message: 'Logout failed' }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
    });
  }
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });
}

// Uppercase aliases for Astro router compatibility
export const GET = get;
export const POST = post;