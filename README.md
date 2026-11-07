# TKS Life status data

The public status site at `https://status.tks.life/` is published by GitHub Pages from this repository. It contains only approved public wording and static page assets. Nothing private belongs here. Engineering owner: [Gabriel Dalton](https://github.com/gabrieldaltontks).

During the application cutover, older `/status` clients also read the raw GitHub `status.json`. Keep this repository public; free GitHub Pages hosting also relies on its public visibility.

## Update the status

1. Open [`status.json`](status.json) on GitHub and click the pencil to edit.
2. Change the affected component's `state`, add or update an incident, and set `generated_at` to the current UTC time.
3. Commit to `main`. The **Check status file** action validates, tests, builds and publishes the complete site to GitHub Pages. Deployment and CDN propagation take time; verify the live data before announcing an update.
4. Check that validation and publication passed. Invalid data blocks publication, leaving the last valid Pages site available. Fix the source promptly; legacy `/status` clients read the raw file directly and can show a load error until it is corrected.

Student and staff wording is reviewed by Lyn, and external or security wording by Andre, under the [status notices SOP](https://github.com/tkslife/tks-life-status/blob/main/docs/status-and-maintenance-sop.md). Use its copy templates. All times are UTC; the page shows them in the reader's local time.

## What can go in the file

The format is a subset of the public allowlist in the [status data contract](https://github.com/tkslife/tks-life-status/blob/main/docs/data-contract.md), holding only what the page shows. `scripts/validate.mjs` rejects anything else.

| Field | Values |
|---|---|
| `components[].description` | Optional one-line explanation under the feature name, up to 120 characters |
| `components[].state` | `operational` (shown as "No known issues"), `degraded`, `outage`, `maintenance`, `unknown` |
| `incidents[].stage` and `updates[].stage` | `investigating`, `identified`, `restoring`, `monitoring`, `resolved` |
| `incidents[].resolved_at` | `null` until resolved; set exactly when `stage` is `resolved` |
| `maintenance[]` | Planned windows with `starts_at`, `ends_at` and `impact`; a future window does not change a component's state |

Version 1 adds a one-line component `description`, a short `title` to incidents and maintenance windows and a `stage` to each incident update, so each update shows where things stood at the time.

Never put student names or details, staff contact details, links, internal hostnames, provider or account names, error messages, logs or credentials in this file. The checker rejects links and email addresses, but it cannot judge everything, so read the text before committing.

### Incident example

```json
{
  "id": "2026-10-23-ai-features",
  "title": "Activate Coach not responding",
  "component_ids": ["ai-features"],
  "stage": "investigating",
  "updates": [
    {
      "published_at": "2026-10-23T22:30:00Z",
      "stage": "investigating",
      "impact": "Activate Coach may show an error instead of replying. Everything else is working.",
      "workaround": "Try again later. Your earlier coaching conversation is kept.",
      "next_update_at": "2026-10-23T23:30:00Z"
    }
  ],
  "resolved_at": null
}
```

Add the newest update first. Keep resolved incidents in the list for a while so people can see what happened.

## Check locally

```bash
node scripts/validate.mjs status.json
```

## Independent site preparation

The static site and GitHub Pages publishing workflow for [TKS-439](https://tkslife.atlassian.net/browse/TKS-439) are described in [HOSTING.md](HOSTING.md). Run `npm ci`, `npm test`, and `npm run build` to produce `dist/`. GitHub Pages publishes validated builds from `main`; custom-domain and application cutover verification are tracked in the ticket.

## Related

- [tks-life-status](https://github.com/tkslife/tks-life-status): the status page design, data contract and SOP. The long-term public page is `status.tks.life`; this file can feed it too.
- [tks-life-frontend](https://github.com/tkslife/tks-life-frontend): the `/status` page that reads this file.
- Backlog ticket [OPS03](https://github.com/tkslife/tks-life-backlog/blob/main/items/OPS03.md).
