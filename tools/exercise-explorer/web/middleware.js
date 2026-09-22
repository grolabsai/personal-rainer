// Vercel Routing Middleware: HTTP Basic auth in front of the whole explorer.
// The password comes from the EXPLORER_PASSWORD environment variable; without it, nobody gets in.
// The media is © Gym visual and is shown here for internal use only — keep this site private.
export const config = { matcher: '/(.*)' };

export default function middleware(request) {
  const expected = process.env.EXPLORER_PASSWORD;
  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (expected && scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (password === expected) return;   // continue to the static file
  }
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Exercise Explorer", charset="UTF-8"' },
  });
}
