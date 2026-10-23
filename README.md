# TKS Life status data

> [!CAUTION]
> 🔴 **Production.** `status.json` is read live by the public TKS Life `/status` page. Whatever you commit to `main` is shown to students and families within a few minutes. Contact for production changes: [Gabriel](https://github.com/gabrieldaltontks).

This repository is public on purpose. It holds only the approved public wording for the status page, so the page can be updated during an incident without a frontend release and without depending on the TKS Life backend. Nothing private belongs here.

## Update the status

1. Open [`status.json`](status.json) on GitHub and click the pencil to edit.
2. Change the affected component's `state`, add or update an incident, and set `generated_at` to the current UTC time.
3. Commit to `main`. The page picks it up within about five minutes (GitHub caches the raw file).
4. Check that the **Check status file** action passed. If the file is invalid, the page shows "We couldn't load the latest status" instead of old or broken information, so fix it straight away.

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

## Related

- [tks-life-status](https://github.com/tkslife/tks-life-status): the status page design, data contract and SOP. The long-term public page is `status.tks.life`; this file can feed it too.
- [tks-life-frontend](https://github.com/tkslife/tks-life-frontend): the `/status` page that reads this file.
- Backlog ticket [OPS03](https://github.com/tkslife/tks-life-backlog/blob/main/items/OPS03.md).
