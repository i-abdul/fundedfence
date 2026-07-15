import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished FundedFence landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /Protect your prop account/);
  assert.match(html, /Read-only MT5 protection layer/);
  assert.match(html, /No trade execution/);
  assert.match(html, /ILLUSTRATIVE DATA/);
  assert.match(html, /not financial advice/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("protects authenticated product pages", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/login\?return_to=%2Fdashboard/);

  const rulesResponse = await render("/rules");
  assert.equal(rulesResponse.status, 307);
  assert.match(rulesResponse.headers.get("location") ?? "", /\/login\?return_to=%2Frules/);
});

test("denies account data and pairing-code creation without browser identity", async () => {
  const accountResponse = await render("/api/v1/accounts/acct_1234567890abcdef1234567890abcdef/live");
  assert.equal(accountResponse.status, 401);
  assert.match(await accountResponse.text(), /authentication_required/);

  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-pairing-denial`);
  const { default: worker } = await import(workerUrl.href);
  const pairingResponse = await worker.fetch(
    new Request("http://localhost/api/v1/pairing-codes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(pairingResponse.status, 401);
  assert.match(await pairingResponse.text(), /authentication_required/);
});
