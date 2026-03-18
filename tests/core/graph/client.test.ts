import { describe, it, expect, beforeEach, mock } from "bun:test";

// Must mock auth BEFORE importing client
mock.module("../../../src/core/graph/auth.js", () => ({
  getAccessToken: () => Promise.resolve("test-token-123"),
  isAuthenticated: () => Promise.resolve(true),
}));

// We test the client by examining what it does with fetch.
// Since graphFetch uses the global `fetch`, we replace it per-test.
describe("graph/client", () => {
  let graphFetch: typeof import("../../../src/core/graph/client.js").graphFetch;
  let graphGet: typeof import("../../../src/core/graph/client.js").graphGet;
  let graphPost: typeof import("../../../src/core/graph/client.js").graphPost;
  let graphPatch: typeof import("../../../src/core/graph/client.js").graphPatch;
  let graphDelete: typeof import("../../../src/core/graph/client.js").graphDelete;
  let fetchCalls: { url: string; options: RequestInit }[];
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    fetchCalls = [];
    // Re-import fresh each time
    const clientMod = await import("../../../src/core/graph/client.js");
    graphFetch = clientMod.graphFetch;
    graphGet = clientMod.graphGet;
    graphPost = clientMod.graphPost;
    graphPatch = clientMod.graphPatch;
    graphDelete = clientMod.graphDelete;
  });

  function setFetchResponse(...responses: Response[]) {
    let callIndex = 0;
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), options: init ?? {} });
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return Promise.resolve(resp.clone());
    }) as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("graphFetch", () => {
    it("prepends Graph base URL for relative paths", async () => {
      setFetchResponse(new Response("{}", { status: 200 }));
      await graphFetch("/me/todo/lists");
      expect(fetchCalls[0].url).toBe("https://graph.microsoft.com/v1.0/me/todo/lists");
    });

    it("passes through absolute URLs", async () => {
      setFetchResponse(new Response("{}", { status: 200 }));
      await graphFetch("https://custom.api.com/endpoint");
      expect(fetchCalls[0].url).toBe("https://custom.api.com/endpoint");
    });

    it("sets Authorization header", async () => {
      setFetchResponse(new Response("{}", { status: 200 }));
      await graphFetch("/me/events");
      const headers = fetchCalls[0].options.headers as Headers;
      expect(headers?.get("Authorization")).toBe("Bearer test-token-123");
    });

    it("sets Content-Type header", async () => {
      setFetchResponse(new Response("{}", { status: 200 }));
      await graphFetch("/me/events");
      const headers = fetchCalls[0].options.headers as Headers;
      expect(headers?.get("Content-Type")).toBe("application/json");
    });

    it("retries once on 401", async () => {
      setFetchResponse(
        new Response("", { status: 401 }),
        new Response("{}", { status: 200 })
      );
      const response = await graphFetch("/me/events");
      expect(response.status).toBe(200);
      expect(fetchCalls).toHaveLength(2);
    });

    it("throws on persistent 401", async () => {
      setFetchResponse(new Response("", { status: 401 }));
      await expect(graphFetch("/me/events")).rejects.toThrow("Authentication failed");
    });

    it("retries on 429 with Retry-After", async () => {
      setFetchResponse(
        new Response("", { status: 429, headers: { "Retry-After": "0" } }),
        new Response('{"ok":true}', { status: 200 })
      );
      const response = await graphFetch("/me/events");
      expect(response.status).toBe(200);
      expect(fetchCalls).toHaveLength(2);
    });
  });

  describe("graphGet", () => {
    it("returns parsed JSON on success", async () => {
      setFetchResponse(new Response(JSON.stringify({ value: [1, 2, 3] }), { status: 200 }));
      const result = await graphGet<{ value: number[] }>("/me/todo/lists");
      expect(result.value).toEqual([1, 2, 3]);
    });

    it("throws on non-OK response", async () => {
      setFetchResponse(new Response("Not Found", { status: 404 }));
      await expect(graphGet("/me/todo/lists/bad-id")).rejects.toThrow("Graph GET");
    });
  });

  describe("graphPost", () => {
    it("sends JSON body and returns parsed response", async () => {
      setFetchResponse(new Response(JSON.stringify({ id: "new-123" }), { status: 201 }));
      const result = await graphPost<{ id: string }>("/me/events", { subject: "Test" });
      expect(result.id).toBe("new-123");
      expect(fetchCalls[0].options.method).toBe("POST");
      expect(JSON.parse(fetchCalls[0].options.body as string)).toEqual({ subject: "Test" });
    });

    it("throws on error response", async () => {
      setFetchResponse(new Response("Bad Request", { status: 400 }));
      await expect(graphPost("/me/events", {})).rejects.toThrow("Graph POST");
    });
  });

  describe("graphPatch", () => {
    it("sends PATCH request with body", async () => {
      setFetchResponse(new Response(JSON.stringify({ id: "updated" }), { status: 200 }));
      await graphPatch("/me/events/123", { subject: "Updated" });
      expect(fetchCalls[0].options.method).toBe("PATCH");
    });
  });

  describe("graphDelete", () => {
    it("sends DELETE request", async () => {
      setFetchResponse(new Response("", { status: 204 }));
      await graphDelete("/me/events/123");
      expect(fetchCalls[0].options.method).toBe("DELETE");
    });

    it("treats 404 as success (already deleted)", async () => {
      setFetchResponse(new Response("", { status: 404 }));
      await graphDelete("/me/events/already-gone"); // should not throw
    });

    it("throws on 500", async () => {
      setFetchResponse(new Response("Server Error", { status: 500 }));
      await expect(graphDelete("/me/events/123")).rejects.toThrow("Graph DELETE");
    });
  });
});

// Need afterEach import
import { afterEach } from "bun:test";
