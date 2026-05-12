import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("collector worker (container host)", () => {
	it("GET /health returns ok", async () => {
		const res = await SELF.fetch("https://x/health");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("unknown route returns 404", async () => {
		const res = await SELF.fetch("https://x/whatever");
		expect(res.status).toBe(404);
	});
});
