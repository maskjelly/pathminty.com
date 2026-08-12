const apiPaths = ["/healthz", "/v1/"] as const;

function isApiRequest(pathname: string) {
  return apiPaths.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path,
  );
}

export default {
  fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    return isApiRequest(pathname)
      ? env.DASHBOARD_API.fetch(request)
      : env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
