import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, realpath } from "node:fs/promises";
import net from "node:net";
import tls from "node:tls";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Loopback-only self-signed fixture. It is never loaded by the production server
// and must not be used as deployment TLS material.
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDCGmFna5LnUJiz
er3MNM41EzsLPsVFFLR2VYJKzB07TYgf+nWtx9ANvSsy9Yp4tU/40dLeBN0XSwVS
IaLhtY+gDL/haJOVODe7n3GV9wNg4azNDTlO4Jd/NW8V2KOu+2FZneM+jGRA/VIZ
5PRwHH76Gi7N5UKNK5GLIOMG2zBmOChez5Fmkr+d0n+vy1N0tAbipbZTD8pZH0lG
KCAF91+FsxsJbffw5N9UwuxQ5k4IR39kBHvtMLzIAyMlN4ymyYk4aPopUtpOyVuG
fRyVRo7EdhDvgmLEAfzrcGde2pJGtdAUM4ywItdyyBJ4YyAgu+HSZ6D/VrQmpzUW
YtLIsy3RAgMBAAECggEABGvw31f437S+YvgXM5wZ1ovVBt8gkKYfHy/fB2I4NPOo
KwNSRwAwrf/Xm7VY3zUd9XvEWnsNof3UyPk1bzMXveqzophc/hn9+G14yAF/73o6
MzpOtx+Z/LBV/7Wtf+G5c8VLUFw6He1ikqHi5bY03pcC85a6OGh/TAyWtpJyB/s+
45h4qNI1JKenhkK2jc5xzAsVF35iSo1B5jCP5/rTFbLgDlmcaqoZcbSDpptTeHzF
2/KB/DGW1i9n7EcxqImdrZwebsUsw9rxZIw3JLhFgRJOeRHtTrU49o0irhtQcsI4
OfmxEk1tti8ocaF+TMIm/OhPqbxElzdkGla4VnMwaQKBgQDths9PekI3ehPYIacu
d4GcOozgujGmWK+oWzO6pplIt+4NJYiM0mHTjekoTdbU014P/qUXsrN+rwC06KKX
C12Jh/rxse9NhxnPaOz9GU5ojvT3+t9DeUbvlfwj9a00NQ6AgPv22onbja80JGFH
7fN/V9fzY+XmF+ClqU2/y0Dg2QKBgQDRMwBSKcKHz8pwPBRXLTOmkWWt6uN8FAcA
rtvxvUvpAdy+Jlk6540ffLHT+QQVMhM2INgF8lzLUQB1Djde098otLrl8iji63rY
PURzz1IsjgbS1bHIcBpXeK8c02/u8dQ0pmXYerPmHp+wxfjUBuSrkYjqCj4mn4nQ
6Wk0PoeZuQKBgQCV01JTRMAd9FAuJdQpuFI2NKyGWIxW7Fwo6xZvJwVLXFG5UzKV
+WKhqkMnHCpl5snPdwW2NA+K2mKsuo1Mj2u6A98js+RJ1+1M6leKsvrFc19MSJ+q
FQbMu6PnHuHZK5pxLmtA48rPhci9MDF4yLyuV7+tFBeBExCuDmQvlcrfyQKBgQDB
cXC1iSn5nborCFMivYiKWN518MKEBJzpE8gMBCfCgVdWeW1/W4gSeqKRSS1uUAyV
u88lyJPn6bILi6bFyBMNt/kvEjqegnLoq9a1ZBsvWfGTWcj4eDjTc6Qxeo6BnBrG
yKtafzQE8YJm2tmZbfpbb8rz557K5jFw/bSre7q1+QKBgHZhonEVTs6omor7WkPT
1ZGRUAwDlWgyfUoib9QGdEw/Cjl2L3M0Xc7oI33pK45wU6leKzqDqyWo+5D5F/3f
BB/ayTmvv8Kn0P04U66yoVmm0tsxLL6Z61PGzPZfE2F8w+JbLqLZWL6y3BZ/Xwz4
jhsbxkmGOpFsg38SrJJuFHQo
-----END PRIVATE KEY-----`;
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUGjUiLLFnAgZIB8DiUbvk4dGtf6wwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDkyMjA0MTAzN1oXDTM2MDkx
OTA0MTAzN1owFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAwhphZ2uS51CYs3q9zDTONRM7Cz7FRRS0dlWCSswdO02I
H/p1rcfQDb0rMvWKeLVP+NHS3gTdF0sFUiGi4bWPoAy/4WiTlTg3u59xlfcDYOGs
zQ05TuCXfzVvFdijrvthWZ3jPoxkQP1SGeT0cBx++houzeVCjSuRiyDjBtswZjgo
Xs+RZpK/ndJ/r8tTdLQG4qW2Uw/KWR9JRiggBfdfhbMbCW338OTfVMLsUOZOCEd/
ZAR77TC8yAMjJTeMpsmJOGj6KVLaTslbhn0clUaOxHYQ74JixAH863BnXtqSRrXQ
FDOMsCLXcsgSeGMgILvh0meg/1a0Jqc1FmLSyLMt0QIDAQABo1MwUTAdBgNVHQ4E
FgQUBaBwi90hPQak5KjYZFeU6g01GFEwHwYDVR0jBBgwFoAUBaBwi90hPQak5KjY
ZFeU6g01GFEwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAPMye
MglTToQh0ekKuW4MlURKcaq4Gh274Ib/j8Dz0aLbDT4IEKYoLjmzJzqu4ta0Gsm4
mf0j5jxuMwCy7AUXv9I3Q5YT9iAQp9rbc7Hhmp3nHmPD5ljHQVxvPbNRXWjkZGHr
IQrk4tXAGSp2haPWsVntiy/lFFY3zQ/W65+pCFjFW3ZXsmZiqarA8aniTcyE6Pux
Ue/kp1R7yNnhQ+1meK7UnnyI5ZkcGX1OcJj3iwaDhUPN/bAyR4DQntVbCtXLU1m1
EY7wZZSTteJwpGyQFeqMWi94yuKngNsPzod3U9GwTap6vizB18+1o1e/XBlSDp6t
mpUaHIxjxpS9STBp2w==
-----END CERTIFICATE-----`;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = join(projectRoot, "work");
await mkdir(workRoot, { recursive: true });
const temp = await mkdtemp(join(workRoot, "auth-mail-"));
const messages = [];
const smtpSockets = new Set();
const secureContext = tls.createSecureContext({
  key: TEST_KEY,
  cert: TEST_CERT,
});

function smtpSession(socket, secure = false) {
  smtpSockets.add(socket);
  socket.setEncoding("utf8");
  let buffer = "";
  let dataMode = false;
  socket.on("close", () => smtpSockets.delete(socket));
  const onData = (chunk) => {
    buffer += chunk;
    while (true) {
      if (dataMode) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end < 0) return;
        messages.push(buffer.slice(0, end).replace(/^\.{2}/gm, "."));
        buffer = buffer.slice(end + 5);
        dataMode = false;
        socket.write("250 2.0.0 queued\r\n");
        continue;
      }
      const end = buffer.indexOf("\r\n");
      if (end < 0) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const command = line.split(/\s+/, 1)[0].toUpperCase();
      if (command === "EHLO" || command === "HELO") {
        socket.write(
          secure
            ? "250-localhost\r\n250 8BITMIME\r\n"
            : "250-localhost\r\n250-STARTTLS\r\n250 8BITMIME\r\n",
        );
      } else if (command === "STARTTLS" && !secure) {
        socket.write("220 2.0.0 Ready to start TLS\r\n", () => {
          socket.removeListener("data", onData);
          const encrypted = new tls.TLSSocket(socket, {
            isServer: true,
            secureContext,
          });
          smtpSession(encrypted, true);
        });
        return;
      } else if (
        command === "MAIL" ||
        command === "RCPT" ||
        command === "RSET"
      ) {
        socket.write("250 2.1.0 OK\r\n");
      } else if (command === "DATA") {
        dataMode = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (command === "QUIT") {
        socket.end("221 2.0.0 Bye\r\n");
      } else if (command === "NOOP") {
        socket.write("250 2.0.0 OK\r\n");
      } else {
        socket.write("502 5.5.2 Command not implemented\r\n");
      }
    }
  };
  socket.on("data", onData);
  if (!secure) socket.write("220 localhost ESMTP auth-mail-test\r\n");
}

const smtpServer = net.createServer((socket) => smtpSession(socket));
await new Promise((resolve, reject) => {
  smtpServer.once("error", reject);
  smtpServer.listen(0, "127.0.0.1", resolve);
});
const smtpPort = smtpServer.address().port;

process.env.NODE_ENV = "test";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.DATABASE_PATH = join(temp, "auth.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:5173";
process.env.SESSION_SECRET = "auth-mail-test-session-secret-32-bytes-minimum";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(smtpPort);
process.env.SMTP_SECURE = "false";
process.env.SMTP_FROM = "no-reply@example.test";

let httpServer;
let db;
const origin = process.env.PUBLIC_ORIGIN;
function decodeQuotedPrintable(value) {
  const input = value.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "=" && /^[0-9A-F]{2}$/i.test(input.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(input.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(input.charCodeAt(i));
  }
  return Buffer.from(bytes).toString("utf8");
}
function messageText(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  const headers = raw.slice(0, split).toLowerCase();
  const body = raw.slice(split).replace(/^\r?\n\r?\n/, "");
  if (/content-transfer-encoding:\s*base64/.test(headers))
    return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  if (/content-transfer-encoding:\s*quoted-printable/.test(headers))
    return decodeQuotedPrintable(body);
  return body;
}
async function waitForCode(index) {
  for (let attempt = 0; attempt < 100 && !messages[index]; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(messages[index], `SMTP message ${index + 1} was not received`);
  const match = messageText(messages[index]).match(/\b\d{6}\b/);
  assert.ok(match, "six-digit code missing from SMTP message");
  return match[0];
}

try {
  const [{ app }, database, security] = await Promise.all([
    import("../server/app.js"),
    import("../server/db.js"),
    import("../server/security.js"),
  ]);
  db = database.db;
  database.run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',1,1,?,1)",
    "owner-mail-test",
    "owner-mail@example.test",
    "Admin",
    await security.hashPassword("owner-mail-test-password-123"),
    new Date().toISOString(),
  );
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  async function request(path, { method = "GET", body, cookie } = {}) {
    return fetch(base + path, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(method === "GET" ? {} : { origin }),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function login(email, password) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    return {
      response,
      cookie: response.headers.get("set-cookie")?.split(";", 1)[0],
    };
  }
  async function issueCode(email, purpose, messageIndex) {
    const response = await request("/api/auth/request-code", {
      method: "POST",
      body: { email, purpose },
    });
    assert.equal(response.status, 200, await response.text());
    return waitForCode(messageIndex);
  }
  async function register(email, nickname, password, messageIndex) {
    const code = await issueCode(email, "register", messageIndex);
    const response = await request("/api/auth/register", {
      method: "POST",
      body: { email, nickname, password, code },
    });
    assert.equal(response.status, 201, await response.text());
    return code;
  }

  const firstEmail = "mail-one@example.test";
  const secondEmail = "mail-two@example.test";
  const oldPassword = "mail-test-old-password-123";
  const newPassword = "mail-test-new-password-456";
  const firstCode = await register(firstEmail, "Mail One", oldPassword, 0);

  let result = await login(firstEmail, oldPassword);
  assert.equal(result.response.status, 200, await result.response.text());
  assert.ok(result.cookie, "password login did not set a session cookie");

  let response = await request("/api/auth/register", {
    method: "POST",
    body: {
      email: firstEmail,
      nickname: "Reused",
      password: "another-password-789",
      code: firstCode,
    },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_CODE");

  const resetCode = await issueCode(firstEmail, "reset", 1);
  response = await request("/api/auth/reset-password", {
    method: "POST",
    body: { email: firstEmail, code: resetCode, newPassword },
  });
  assert.equal(response.status, 200, await response.text());
  assert.equal((await login(firstEmail, oldPassword)).response.status, 401);
  const firstLogin = await login(firstEmail, newPassword);
  assert.equal(
    firstLogin.response.status,
    200,
    await firstLogin.response.text(),
  );

  await register(secondEmail, "Mail Two", "second-account-password-123", 2);
  const secondLogin = await login(secondEmail, "second-account-password-123");
  assert.equal(
    secondLogin.response.status,
    200,
    await secondLogin.response.text(),
  );
  const firstMe = await request("/api/me", { cookie: firstLogin.cookie });
  const secondMe = await request("/api/me", { cookie: secondLogin.cookie });
  assert.equal(firstMe.status, 200);
  assert.equal(secondMe.status, 200);
  assert.equal((await firstMe.json()).email, firstEmail);
  assert.equal((await secondMe.json()).email, secondEmail);
  assert.notEqual(firstLogin.cookie, secondLogin.cookie);

  const ownerLogin = await login(
    "owner-mail@example.test",
    "owner-mail-test-password-123",
  );
  assert.equal(
    ownerLogin.response.status,
    200,
    await ownerLogin.response.text(),
  );
  const secondUser = database.one(
    "SELECT id FROM users WHERE email=?",
    secondEmail,
  );
  response = await request(`/api/admin/accounts/${secondUser.id}`, {
    method: "PATCH",
    cookie: ownerLogin.cookie,
    body: { role: "admin", permissions: ["content", "shop_reviews"] },
  });
  assert.equal(response.status, 200, await response.text());
  const adminLogin = await login(secondEmail, "second-account-password-123");
  assert.equal(
    adminLogin.response.status,
    200,
    await adminLogin.response.text(),
  );
  assert.equal(
    (
      await request("/api/admin/queue?type=articles", {
        cookie: adminLogin.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/admin/queue?type=reviews", {
        cookie: adminLogin.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/admin/accounts", { cookie: adminLogin.cookie }))
      .status,
    403,
  );

  console.log(
    "PASS: mail auth, reset, isolation, and owner-promoted verified-user RBAC",
  );
} finally {
  if (httpServer)
    await new Promise((resolve) => httpServer.close(() => resolve()));
  if (db) db.close();
  for (const socket of smtpSockets) socket.destroy();
  await new Promise((resolve) => smtpServer.close(() => resolve()));
  const safeWorkRoot = await realpath(workRoot);
  const safeTemp = await realpath(temp).catch(() => temp);
  assert.equal(
    dirname(safeTemp),
    safeWorkRoot,
    "refusing to remove temp outside workspace/work",
  );
  await rm(safeTemp, { recursive: true, force: true });
}
