# Independent status site — TKS-439

Prepared for [TKS-439](https://tkslife.atlassian.net/browse/TKS-439). Engineering owner: Gabriel Dalton. Hosting, DNS, cost acceptance and deployment verification are pending. The workflow publishes only when `STATUS_PUBLISH_ENABLED` is explicitly set to `true`; it is not enabled by this change.

The static page moves the existing frontend `/status` view from revision `4da66c008911cfbde6b0ead1c7f4ab8cd39ffafb`. It preserves the layout, Geist fonts, public wording, incidents, maintenance, refresh cooldown and error recovery. Next.js routing and image handling become ordinary HTML. The home link returns to `https://tks.life/`. Data loads from `/status.json` on the status host every 30 seconds. No application API, authentication, analytics or runtime server is included.

## Build and verify

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

Only `dist/` is a publication artifact. The build clears that directory and copies an explicit allowlist. JavaScript and CSS filenames include content hashes. Fonts include their licence. `status.json` must pass the existing public allowlist validator before the build or publication can proceed. Public status wording remains subject to the existing review process.

## Proposed AWS configuration

- Separate private S3 bucket with public access blocked, accessed through CloudFront origin access control. No ECS service, database, NAT gateway, new hosted zone or paid monitoring.
- CloudFront Free flat-rate plan, subject to verified eligibility. Use the managed caching policy that honours origin cache headers with a minimum TTL no longer than one second. No paid plan upgrades.
- Non-exportable ACM public certificate in `us-east-1` for `status.tks.life`, with Route 53 DNS validation. Keep validation records for renewal.
- A and AAAA aliases in the existing authoritative `tks.life` hosted zone. Capture the provider state before mutation and verify authoritative and recursive DNS plus TLS afterwards.
- GitHub OIDC role with exact audience `sts.amazonaws.com` and subject `repo:tkslife/status-data:environment:status-production`. Restrict that GitHub environment's deployment branches to `main`; the environment subject alone does not restrict branches. Permissions: list the dedicated bucket, get/put its public site objects, and invalidate this distribution. No object deletion or permissions on application resources.

S3 requests are metered separately. The AWS account check returned CloudFront allowances but no S3 free allowance. **Do not enable the S3 configuration as guaranteed zero cost.** Cost acceptance remains pending.

## Publish configuration

Set `STATUS_PUBLISH_ENABLED` as a **repository variable**: the job condition is evaluated before environment variables load. The remaining variables can be scoped to `status-production`. Set them only after the infrastructure, cost and access review:

| Variable | Value |
| --- | --- |
| `STATUS_PUBLISH_ENABLED` | `true` only after the deployment gate is cleared |
| `STATUS_PUBLISH_ROLE_ARN` | Restricted GitHub OIDC role |
| `STATUS_AWS_REGION` | Dedicated bucket's region |
| `STATUS_BUCKET` | Dedicated private status bucket |
| `STATUS_DISTRIBUTION_ID` | Independent status distribution |

The workflow validates, tests and builds before credentials are acquired. It serializes runs and rejects a superseded source revision before publishing. Assets upload before HTML; data is a single final object write. Assets from earlier builds are retained so cached HTML remains usable. Invalid data leaves the last published file untouched. The origin sends a 15-second cache lifetime for HTML and data; publication invalidates those paths. Measure commit-to-visible latency before claiming the one-minute acceptance target.

## Cutover and recovery

1. Verify the new host, all assets, JSON, TLS, noindex and error recovery before changing app links.
2. Verify independence from application hosts, and coordinate the required Dev outage acceptance test with the release operator.
3. Update the app's login, 404 and Coach error links and make `/status` a permanent redirect, through reviewed Dev integration and the application release process.
4. Disable publishing to hold the last good site. Recover content by reverting the offending source change on main, validating, and republishing; never publish unvalidated JSON directly.
5. Before DNS cutover, record exact DNS rollback values and hosting identifiers in the restricted operational record. Do not remove hosting while application links target it.

Keep the data repository public while existing deployed `/status` clients use its raw GitHub URL. Repository visibility is a separate change after the migration is verified.
