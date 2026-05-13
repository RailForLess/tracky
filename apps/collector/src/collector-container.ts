import { Container } from "@cloudflare/containers";

// Hostname the Go collector PUTs backlog blobs to. The hostname is fake — the
// outbound() handler below intercepts before any DNS lookup happens and
// proxies through the R2 binding, so the container needs no R2 credentials.
const R2_BACKLOG_HOST = "r2-backlog.tracky.internal";

export class CollectorContainer extends Container {
	defaultPort = 8080;
	sleepAfter = "5m";
	enableInternet = true;
	envVars = {
		BACKLOG_URL: "http://r2-backlog.tracky.internal",
		INGEST_URL: this.env.INGEST_URL,
		METRA_API_KEY: this.env.METRA_API_KEY,
		CTA_BUS_API_KEY: this.env.CTA_BUS_API_KEY,
		CTA_TRAIN_API_KEY: this.env.CTA_TRAIN_API_KEY,
	};
	pingEndpoint = "/health";
}

// Per-host interception only — the R2 backlog hostname is fake and routes
// through the BACKLOG_BUCKET binding so the container holds no R2 creds.
// Everything else (upstream GTFS-RT feeds, INGEST_URL) goes straight to the
// internet, which avoids HTTPS interception breaking on legacy IIS origins.
//
// NOTE: must be assigned outside the class body. With `useDefineForClassFields`
// (default for target: es2024), `static outboundByHost = ...` inside the class
// is a [[Define]] that creates an own property and bypasses Container's static
// setter — so the framework's registry stays empty and no interception runs.
CollectorContainer.outboundByHost = {
	[R2_BACKLOG_HOST]: async (req, env, _ctx) => {
		if (req.method !== "PUT") return new Response("method not allowed", { status: 405 });
		const url = new URL(req.url);
		const key = url.pathname.replace(/^\//, "");
		if (!key.startsWith("backlog/")) return new Response("forbidden key prefix", { status: 403 });
		await env.BACKLOG_BUCKET.put(key, await req.arrayBuffer());
		return new Response(null, { status: 204 });
	}
};
