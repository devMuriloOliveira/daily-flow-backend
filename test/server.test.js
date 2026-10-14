const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../src/server");

function request(server, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        ...options,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ res, body });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    return await callback(server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("health check returns ok", async () => {
  await withServer(async (server) => {
    const { res, body } = await request(server, {
      path: "/healthz",
      method: "GET",
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(body).status, "ok");
  });
});

test("preflight for login allows the production frontend origin", async () => {
  await withServer(async (server) => {
    const { res } = await request(server, {
      path: "/users/login",
      method: "OPTIONS",
      headers: {
        Origin: "https://daily-flow-frontend.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    assert.equal(res.statusCode, 204);
    assert.equal(
      res.headers["access-control-allow-origin"],
      "https://daily-flow-frontend.vercel.app"
    );
    assert.match(res.headers["access-control-allow-methods"], /POST/);
    assert.match(res.headers["access-control-allow-headers"], /Content-Type/i);
  });
});

test("preflight rejects unknown browser origins", async () => {
  await withServer(async (server) => {
    const { res } = await request(server, {
      path: "/users/login",
      method: "OPTIONS",
      headers: {
        Origin: "https://malicious.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
});
