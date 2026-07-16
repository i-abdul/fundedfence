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

test("renders FundedNext account setup options", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-fundednext-setup`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/pairing?firm=fundednext&program=fundednext-stellar-2-step&phase=Phase%201&size=10000000", {
      headers: { accept: "text/html", cookie: await testSessionCookie() },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FundedNext/);
  assert.match(html, /Stellar 2-Step/);
  assert.match(html, /\$100,000 USD/);
  assert.match(html, /\$549\.99/);

  const signedOutResponse = await render("/pairing?firm=fundednext&program=fundednext-stellar-2-step&phase=Phase%201&size=10000000");
  assert.equal(signedOutResponse.status, 200);
  assert.match(await signedOutResponse.text(), /return_to=%2Fpairing%3Ffirm%3Dfundednext/);

  const instantResponse = await render("/pairing?firm=fundednext&program=fundednext-stellar-instant&phase=Instant%20funded&size=2000000");
  assert.equal(instantResponse.status, 200);
  const instantHtml = await instantResponse.text();
  assert.match(instantHtml, /Stellar Instant/);
  assert.match(instantHtml, /\$20,000 USD/);
  assert.match(instantHtml, /\$449\.99/);
});

test("denies account data and pairing-code creation without browser identity", async () => {
  const accountsResponse = await render("/api/v1/accounts");
  assert.equal(accountsResponse.status, 401);
  assert.match(await accountsResponse.text(), /authentication_required/);

  const accountResponse = await render("/api/v1/accounts/acct_1234567890abcdef1234567890abcdef/live");
  assert.equal(accountResponse.status, 401);
  assert.match(await accountResponse.text(), /authentication_required/);

  const pairingStatusResponse = await render("/api/v1/pairing-codes");
  assert.equal(pairingStatusResponse.status, 401);
  assert.match(await pairingStatusResponse.text(), /authentication_required/);

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

test("classifies an expired connector access token as refreshable authentication failure", async () => {
  const connectorSecret = "test-connector-secret-12345678901234567890";
  process.env.CONNECTOR_TOKEN_SECRET = connectorSecret;
  const expiredToken = await testDeviceToken({
    deviceId: "dev_12345678",
    accountId: "acct_12345678",
    tokenType: "access",
    issuedAt: Date.now() - 120_000,
    expiresAt: Date.now() - 60_000,
    nonce: "nonce_12345678",
  }, connectorSecret);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-expired-connector-token`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/v1/connector/events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${expiredToken}`,
        "content-type": "application/json",
        "x-fundedfence-signature": "00",
      },
      body: "{}",
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      CONNECTOR_TOKEN_SECRET: connectorSecret,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /connector_token_invalid/);
});

async function testSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    email: "test@example.com",
    displayName: "Test User",
    expiresAt: Date.now() + 60000,
  })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-session-secret-12345678901234567890"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))).toString("base64url");
  process.env.APP_SESSION_SECRET = "test-session-secret-12345678901234567890";
  return `fundedfence_session=${payload}.${signature}`;
}

async function testDeviceToken(claims, secret) {
  const payload = Buffer.from(JSON.stringify(claims, Object.keys(claims).sort())).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))).toString("hex");
  return `${payload}.${signature}`;
}
