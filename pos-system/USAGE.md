Quick usage notes for Home Assistant users

Problem: embedding the POS add-on in a Lovelace `iframe` can block camera access or show the Home Assistant sidebar inside the iframe.

Recommended short-term solutions:

1) Open POS in a new tab (fastest, most reliable)

- Create a Lovelace card (picture-elements or button) that opens `https://<your-domain>:8100` in a new window.

2) Use the supplied custom `pos-iframe-card` (in `rootfs/app/public/pos-iframe-card/pos-iframe-card.js`) to add `allow="camera; microphone"` to the iframe.

Install instructions for the custom card:

- Copy `rootfs/app/public/pos-iframe-card/pos-iframe-card.js` to Home Assistant `www` (or leave it in the add-on's public so it is served by the add-on), then add a resource entry:

  Resource URL: `/local/pos-iframe-card/pos-iframe-card.js` (or `/a6f60c51_pos_system/pos-iframe-card/pos-iframe-card.js` if served by add-on)
  Resource type: `JavaScript Module`

- Example Lovelace usage:

```yaml
type: 'custom:pos-iframe-card'
url: 'https://cloud35.duckdns.org:8100'
height: '100vh'
```

Notes and limitations:
- Browsers treat different ports as different origins. Even with `allow` set, cross-origin iframes may still block getUserMedia. The robust solution is to serve POS under the same origin (same domain + port) as Home Assistant (reverse-proxy).
- If you run into `NotAllowedError`, check browser permission via the lock icon and confirm the site has camera permission.

Long-term (recommended) solutions:

- Configure a reverse-proxy (nginx) to expose POS under `https://your-domain/pos/` and proxy to the add-on port (8100). This makes the iframe same-origin and eliminates camera permission issues.

Example nginx snippet (backend possibly self-signed):

```nginx
location /pos/ {
  proxy_pass https://127.0.0.1:8100/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 90;
  proxy_ssl_verify off; # if backend uses self-signed cert
}
```

If you want, I can:
- Add the `pos-iframe-card` to the repo root to make packaging easier, or
- Add a short script to generate a Lovelace dashboard with a button to open POS in a new tab, or
- Provide a tested nginx config and instructions for common Home Assistant setups.
