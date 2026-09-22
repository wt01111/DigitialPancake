// Runs the real Express + SQLite integration suite in an isolated workspace DB.
// api.mjs owns setup, assertions, guarded cleanup, and never touches the default database.
await import("./api.mjs");
