const apiPaths = ["/healthz", "/v1/"] as const;

const legalAssets: Record<string, string> = {
  "/privacy": "/privacy/index.html",
  "/privacy/": "/privacy/index.html",
  "/terms": "/terms/index.html",
  "/terms/": "/terms/index.html",
  "/support": "/support/index.html",
  "/support/": "/support/index.html",
};

function isApiRequest(pathname: string) {
  return apiPaths.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path,
  );
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (isApiRequest(url.pathname)) return env.DASHBOARD_API.fetch(request);
    const legal = legalAssets[url.pathname];
    if (legal) {
      return env.ASSETS.fetch(new URL(legal, url.origin));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
