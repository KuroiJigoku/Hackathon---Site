// API route: POST /api/logout
// Clears the auth cookie
export async function post(){
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `sa_token=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`);
  return new Response(JSON.stringify({ message: 'logged out' }), { status: 200, headers });
}
