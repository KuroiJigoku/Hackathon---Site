// Centralized security headers for server responses.
// Use `buildSecureHeaders({ nonce, allowUnsafeInlineStyles })` to get headers
// For production, pass `allowUnsafeInlineStyles: false` and include a per-request nonce.

export function buildSecureHeaders({ nonce, allowUnsafeInlineStyles = false } = {}){
  const scriptSrc = ["'self'"];
  const styleSrc = ["'self'"];
  if(nonce){
    scriptSrc.push(`'nonce-${nonce}'`);
    styleSrc.push(`'nonce-${nonce}'`);
  }
  if(allowUnsafeInlineStyles){
    // Helpful for dev toolbars that set element.style — avoid in production
    styleSrc.push("'unsafe-inline'");
  }

  const CSP = [
    "default-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    'Content-Security-Policy': CSP,
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '0',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Permissions-Policy': "geolocation=(), microphone=(), camera=(), payment=()",
    'Cache-Control': 'no-store',
  };
}

export default buildSecureHeaders;
