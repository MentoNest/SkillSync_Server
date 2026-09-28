# CORS Configuration

The backend validates browser origins against the comma-separated `CORS_ORIGINS` environment variable. Configure exact origins, including scheme and port where applicable, for each frontend and staging site. Entries must be origins only, with no path, query, or fragment. An unlisted `Origin` is rejected with HTTP `403` and a JSON error; requests without an `Origin` header remain available to non-browser clients.

In `development`, `http://localhost`, `https://localhost`, `http://127.0.0.1`, and `http://[::1]` are allowed with any port. These development exceptions are disabled in other environments. An empty allowlist in production therefore denies every browser origin by default.

Allowed methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`; allowed headers are `Authorization`, `Content-Type`, and `Accept`. Credentials are enabled, and successful preflight requests return HTTP `204`. Allowed origins receive CORS headers on ordinary and error responses.

Example:

```dotenv
CORS_ORIGINS=https://skillsync.example.com,https://staging.skillsync.example.com
```

Because credentials are enabled, do not use wildcard origins. Browsers require the frontend to send requests with credentials enabled when using cookies.
