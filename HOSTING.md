# Independent status site - TKS-439

[TKS-439](https://tkslife.atlassian.net/browse/TKS-439). Engineering owner: Gabriel Dalton. Hosting: GitHub Pages, selected 6 November 2026. Custom domain: `status.tks.life`. HTTPS and independence from both Dev application services were verified on 7 November 2026; subsequent UI and redirect changes are tracked in the ticket.

The static page moves the existing frontend `/status` view from revision `4da66c008911cfbde6b0ead1c7f4ab8cd39ffafb`. It preserves the layout, Geist fonts, public wording, incidents, maintenance, refresh cooldown and error recovery. Next.js routing and image handling become ordinary HTML. The home link returns to `https://tks.life/`. Data loads from `/status.json` on the status host every 30 seconds. No application API, authentication, analytics or runtime server is included.

## Build and publish

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

Only `dist/` is published. The build clears that directory and copies an explicit allowlist. JavaScript and CSS filenames include content hashes. Fonts include their licence. The existing public allowlist validator must pass before the build or publication. Invalid data leaves the last published site untouched. Public wording remains subject to the existing review process.

The workflow validates and builds for branches and pull requests. Only `main` can publish through the `github-pages` environment; restrict that environment to `main`. Its deployment job has `pages: write` and `id-token: write`, with no AWS credentials. Runs serialize, and a superseded revision fails before publication. GitHub Pages deploys the complete validated artifact.

## Hosting and cost

- Use GitHub Pages with build type `workflow` on this existing public repository. GitHub provides static hosting and HTTPS without a hosting subscription.
- Configure `status.tks.life` in GitHub before adding its DNS record. Enforce HTTPS once GitHub has issued the certificate.
- Add `status.tks.life CNAME tkslife.github.io` with TTL 300 in the existing authoritative Route 53 zone. Capture current provider state and verify authoritative and recursive DNS plus TLS afterwards.
- No S3 bucket, CloudFront distribution, ACM certificate, IAM role, ECS service or new hosted zone is required. Existing Route 53 query charges continue to apply.
- The site can remain available through application/ECS outages. DNS still depends on Route 53; publishing and serving depend on GitHub.

GitHub Pages controls deployment propagation and cache lifetimes. A 30-second browser refresh does not establish a one-minute commit-to-visible guarantee. Measure actual publication latency and record this limit in acceptance evidence.

The live JSON response currently has `Cache-Control: max-age=600`. Browser refreshes do not bypass GitHub's edge cache. Polling pauses while the tab is hidden and refreshes immediately when it becomes visible. A single variable Geist font replaces three static weights, and minified page styles share one stylesheet. Favicons match the main TKS Life site. The 90-day history is calculated from the existing static JSON; it adds no backend endpoint or scheduled service. See the README for retention and coverage rules.

## Cutover and recovery

1. Verify the new host, all assets, JSON, HTTPS, noindex and error recovery before changing application links.
2. Verify the page makes no requests to the application or its API. Coordinate a Dev outage drill with the release operator when required; do not interrupt other active work.
3. Update login, 404 and Coach error links and make `/status` a permanent redirect, through reviewed Dev integration and application release.
4. Recover a bad site by reverting the source change on `main`, passing validation and republishing. Invalid JSON never reaches the deployed site.
5. Do not remove the GitHub Pages custom domain while its DNS record points to GitHub. If hosting must be removed, remove the exact task-created CNAME first to avoid a dangling domain.

Keep this repository public: that is the selected free GitHub Pages hosting arrangement, and older deployed `/status` clients still use its raw GitHub data URL during cutover.
