import { renderToReadableStream } from "react-dom/server.browser";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";

import { addDocumentResponseHeaders } from "./shopify.server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  responseHeaders.set("Content-Type", "text/html");

  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        console.error("React rendering failed", error);
      },
    },
  );

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
