import { getContainer } from "@cloudflare/containers";
export { ContainerProxy } from "@cloudflare/containers";
export { CollectorContainer } from "./collector-container";

export default {
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === "/health") {
			return new Response("ok", { status: 200 });
		}
		return new Response("not found", { status: 404 });
	},

	async scheduled(_ctrl, env, _ctx): Promise<void> {
		console.log("Scheduled event triggered, waking collector container...");
		const stub = getContainer(env.COLLECTOR_CONTAINER);
		try {
			const res = await stub.fetch("https://container.internal/wake");
			console.log("wake response:", res.body ? await res.text() : "no body");
		} catch (e) {
			console.error("wake failed:", e);
		}
	}
} satisfies ExportedHandler<Env>;
