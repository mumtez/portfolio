# Deploying to GitHub Pages

Every push to `main` runs `.github/workflows/deploy.yml`. The `build` job installs dependencies, runs `npm run test:all` (type check, unit tests, build, built-site tests), and uploads `dist/`. The `deploy` job publishes it to Pages, and only runs if `build` passed, so a failing test blocks the deploy. It can also be started by hand from the Actions tab (`workflow_dispatch`).

## One-time setup

1. **Turn on Pages from Actions.** In the repo, go to Settings → Pages → Build and deployment and set Source to **GitHub Actions**. Do this before the first push to `main`, or the first deploy fails.
2. **Check the default URL.** After the first deploy the site is at <https://mumtez.github.io/portfolio/>. The site is built for the root of `aburustum.com`, so at this sub-path the HTML content shows but the Grid script 404s. That is expected until the custom domain is live.
3. **Add the DNS records** below at Name.com.
4. **Set the custom domain.** Once the records resolve, go to Settings → Pages → Custom domain, enter `aburustum.com` and save. When the certificate is issued, which can take up to an hour, tick **Enforce HTTPS**.

The domain is set in Pages settings because when Pages deploys from Actions, GitHub ignores the `CNAME` file in `dist/`. That file is there only to keep the domain in the repo. Setting the domain before DNS resolves would redirect the github.io URL to a domain that doesn't load yet.

Optional, but it guards against domain takeover: verify `aburustum.com` under your GitHub account's Settings → Pages → Verified domains. GitHub shows a TXT record to add.

## DNS records at Name.com

Under Domains → aburustum.com → Manage DNS Records:

### Add

| Type  | Host    | Answer              |
| ----- | ------- | ------------------- |
| A     | (blank) | 185.199.108.153     |
| A     | (blank) | 185.199.109.153     |
| A     | (blank) | 185.199.110.153     |
| A     | (blank) | 185.199.111.153     |
| AAAA  | (blank) | 2606:50c0:8000::153 |
| AAAA  | (blank) | 2606:50c0:8001::153 |
| AAAA  | (blank) | 2606:50c0:8002::153 |
| AAAA  | (blank) | 2606:50c0:8003::153 |
| CNAME | `www`   | `mumtez.github.io`  |

A blank host means the apex, `aburustum.com` itself. The AAAA records add IPv6 and are optional. With `www` pointed at `mumtez.github.io`, Pages redirects `www.aburustum.com` to the apex.

### Remove

Remove any existing apex (blank host) or `www` records, such as Name.com's default parking or URL-forwarding records. They conflict with the ones above.

### Do not touch

- **`ftc`**: `ftc.aburustum.com` serves the FTC Event Viewer from the homelab. Leave this record exactly as it is.
- MX, TXT or other records you didn't add for Pages.

## Checking it worked

```sh
dig +short aburustum.com          # the four 185.199.10x.153 addresses
dig +short www.aburustum.com      # mumtez.github.io. then the same addresses
dig +short ftc.aburustum.com      # unchanged: still the homelab
```
