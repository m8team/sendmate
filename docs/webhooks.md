# Webhooks

Add a **Webhook** channel to a form and sendm8 will `POST` every new submission to your URL as JSON.

## Request

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: sendm8/1.0 (+https://sendm8.com)
X-Sendm8-Event: submission.created
X-Sendm8-Delivery: 01j8x3k6v7m2q9w4e5r6t7y8u9
X-Sendm8-Signature: t=1757930400,v1=5f2b…
```

```json
{
  "event": "submission.created",
  "form": { "id": "k3x9q2m7ab", "name": "Contact" },
  "submission": {
    "id": "01j8x3k6v7m2q9w4e5r6t7y8u9",
    "createdAt": "2026-09-15T10:00:00.000Z",
    "data": { "email": "ada@example.com", "message": "Hi!" },
    "subject": null,
    "replyTo": "ada@example.com",
    "referrer": "https://yoursite.com/contact",
    "country": "GB"
  }
}
```

The **Send test** button sends the same shape with `"event": "test"`.

## Verifying the signature

Your signing secret (`whsec_…`) is shown once when you create the channel. You can rotate it from the dashboard.

`v1` is `HMAC-SHA256(secret, "<t>.<raw request body>")` in hex. Compare it in constant time and reject old timestamps to stop replays.

```js
import crypto from "node:crypto";

export function verifySendm8(rawBody, header, secret, toleranceSeconds = 300) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

Always verify against the **raw** body, before parsing the JSON.

## Delivery rules

- Respond with any `2xx` within 5 seconds.
- `408`, `429`, `5xx`, timeouts and network errors are retried after 1, 5, 30 and 120 minutes (5 attempts in total).
- Other `4xx` responses and redirects are treated as permanent failures. Redirects are never followed.
- URLs must be `https://` on a public host.
- `X-Sendm8-Delivery` is the submission id. A retry can deliver the same submission more than once, so use it to de-duplicate.
