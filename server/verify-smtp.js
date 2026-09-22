import nodemailer from "nodemailer";

const host = String(process.env.SMTP_HOST || "").trim();
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === "true";
const user = String(process.env.SMTP_USER || "").trim();
const pass = String(process.env.SMTP_PASS || "");
const from = String(process.env.SMTP_FROM || "").trim();

if (
  !host ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !user ||
  !pass ||
  !from
) {
  console.error(
    "SMTP verification failed: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM must all be configured.",
  );
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    tls: { servername: host, rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.verify();
    console.log(
      `SMTP TLS and authentication verified (${host}:${port}, secure=${secure}). No message was sent.`,
    );
  } catch (error) {
    const details = [
      error?.code && `code=${String(error.code).slice(0, 40)}`,
      Number.isInteger(error?.responseCode) &&
        `responseCode=${error.responseCode}`,
      error?.command && `command=${String(error.command).slice(0, 40)}`,
    ].filter(Boolean);
    console.error(
      `SMTP verification failed${details.length ? ` (${details.join(", ")})` : ""}. No message was sent and credentials were not printed.`,
    );
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
