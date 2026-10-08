// Dedicated owner host: no public website, account APIs, or event collection.
import backend from './index.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect(url.origin + '/owner-analytics/', 302);
    const report = ['/api/analytics/projects', '/api/analytics/summary', '/api/analytics/cloudflare'].includes(url.pathname);
    const asset = url.pathname === '/owner-analytics' || url.pathname.startsWith('/owner-analytics/');
    if (!['GET', 'HEAD'].includes(request.method) || (!report && !asset)) {
      return new Response('Not found', {status:404,headers:{'Cache-Control':'no-store'}});
    }
    return backend.fetch(request, env);
  }
};
