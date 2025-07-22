var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-jjkwZj/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-jjkwZj/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
var src_default = {
  async fetch(request, env, ctx2) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }
    if (url.pathname.startsWith("/file/")) {
      return handleFile(request, env);
    }
    return jsonResponse({ error: "Not Found" }, 404);
  }
};
async function handleUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get("file");
  const passphrase = formData.get("passphrase");
  const expiry = formData.get("expiry");
  const oneTimeView = formData.get("oneTimeView") === "true";
  if (!file || file.size === 0) {
    return jsonResponse({ error: "File not found or empty" }, 400);
  }
  if (file.size > 100 * 1024 * 1024) {
    return jsonResponse({ error: "File size exceeds 100MB limit" }, 400);
  }
  const id = crypto.randomUUID();
  const fileData = await file.arrayBuffer();
  await env.R2_BUCKET.put(id, fileData, {
    httpMetadata: {
      contentType: file.type
    }
  });
  let expires_at = null;
  if (expiry && expiry !== "one-time") {
    const now = /* @__PURE__ */ new Date();
    switch (expiry) {
      case "1h":
        now.setHours(now.getHours() + 1);
        break;
      case "1d":
        now.setDate(now.getDate() + 1);
        break;
      case "7d":
        now.setDate(now.getDate() + 7);
        break;
    }
    expires_at = Math.floor(now.getTime() / 1e3);
  }
  let passphrase_hash = null;
  if (passphrase) {
    const encoder = new TextEncoder();
    const data = encoder.encode(passphrase);
    const hash = await crypto.subtle.digest("SHA-256", data);
    passphrase_hash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  await env.D1_DB.prepare(
    "INSERT INTO files (id, name, type, size, expires_at, one_time_view, passphrase_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    file.name,
    file.type,
    file.size,
    expires_at,
    oneTimeView ? 1 : 0,
    passphrase_hash,
    Math.floor(Date.now() / 1e3)
  ).run();
  const fileUrl = `${new URL(request.url).origin}/file/${id}`;
  return jsonResponse({ url: fileUrl });
}
__name(handleUpload, "handleUpload");
async function handleFile(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[2];
  if (!id) {
    return jsonResponse({ error: "Invalid file ID" }, 400);
  }
  if (request.method === "GET" && request.headers.get("Accept") === "application/json") {
    const fileInfo2 = await env.D1_DB.prepare("SELECT name, size, passphrase_hash FROM files WHERE id = ?").bind(id).first();
    if (!fileInfo2) {
      return jsonResponse({ error: "File not found" }, 404);
    }
    return jsonResponse({
      name: fileInfo2.name,
      size: fileInfo2.size,
      requiresPassphrase: !!fileInfo2.passphrase_hash
    });
  }
  const fileInfo = await env.D1_DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (!fileInfo) {
    return jsonResponse({ error: "File not found" }, 404);
  }
  if (fileInfo.expires_at && new Date(fileInfo.expires_at * 1e3) < /* @__PURE__ */ new Date()) {
    await env.R2_BUCKET.delete(id);
    await env.D1_DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
    return jsonResponse({ error: "File expired" }, 410);
  }
  if (fileInfo.passphrase_hash) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Passphrase required" }, 401);
    }
    const body = await request.json();
    const passphrase = body.passphrase;
    if (!passphrase) {
      return jsonResponse({ error: "Passphrase not provided" }, 401);
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(passphrase);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const provided_hash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (provided_hash !== fileInfo.passphrase_hash) {
      return jsonResponse({ error: "Invalid passphrase" }, 403);
    }
  }
  const object = await env.R2_BUCKET.get(id);
  if (object === null) {
    return jsonResponse({ error: "File not found in storage" }, 404);
  }
  if (fileInfo.one_time_view) {
    ctx.waitUntil(env.R2_BUCKET.delete(id));
    ctx.waitUntil(env.D1_DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run());
  }
  const headers = new Headers(CORS_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Content-Disposition", `attachment; filename="${fileInfo.name}"`);
  return new Response(object.body, {
    headers
  });
}
__name(handleFile, "handleFile");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-jjkwZj/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx2, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx2, dispatch, tail);
    }
  };
  return head(request, env, ctx2, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx2, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx2, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-jjkwZj/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx2) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx2);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx2) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx2);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx2, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx2) => {
      this.env = env;
      this.ctx = ctx2;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
