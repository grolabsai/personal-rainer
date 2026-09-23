// Vercel Routing Middleware: HTTP Basic auth in front of the Exercise Explorer only.
// The coach app beside it has real accounts (Supabase) and a coach-role gate, so it needs no
// second lock; the explorer browses the whole dataset with no sign-in, and its media is
// © Gym visual, shown for internal use — so that part stays behind a password.
// The password comes from the EXPLORER_PASSWORD environment variable; without it, nobody gets in.
export const config = { matcher: '/explorer/(.*)' };

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
