// Express 4 does NOT catch rejected promises from async route handlers. An
// unhandled rejection inside an async route (e.g. a Postgres type error from
// a bad :id param) crashes the entire Node process, taking every other request
// down with it — not just failing the one request.
//
// This was originally fixed by hand-wrapping each route in sessions.js with
// try/catch, but that only protected one file and had to be remembered for
// every new route. This wraps the router's methods once so EVERY route, in
// every file, is protected automatically, including ones added later.
//
// Behaviour: a rejected async handler is forwarded to next(err), which reaches
// the global error handler in index.js and returns a clean 500 JSON response.
// Existing per-route try/catch blocks still work and take precedence.

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'];

export function guardRouter(router) {
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => {
      const wrapped = handlers.map(h => {
        if (typeof h !== 'function') return h;
        // Preserve Express error-handling middleware signature (4 args).
        if (h.length === 4) return h;
        return function guarded(req, res, next) {
          try {
            const result = h(req, res, next);
            if (result && typeof result.then === 'function') {
              result.catch(next);
            }
            return result;
          } catch (err) {
            next(err);
          }
        };
      });
      return original(path, ...wrapped);
    };
  }
  return router;
}
