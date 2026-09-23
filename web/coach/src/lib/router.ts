import { useEffect, useState } from 'react';

// Hash routes keep the app a static site: #/, #/program/:id, #/workout/:id?a=:assignment,
// #/exercise/:variant?item=:workoutItem, #/play, #/history, #/done/:session
export type Route = { path: string[]; query: URLSearchParams };

const parse = (): Route => {
  const [p, q] = (location.hash.replace(/^#/, '') || '/').split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
};

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (to: string) => { location.hash = to; };
