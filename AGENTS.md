# MIB implementation guidance

This is David's Make It Better project. Keep the submission flow extremely short: button, big text field, optional email and opt-in, send. No mandatory account, name, or categorization. All apps use the same branded widget.

Cloudflare Workers + D1. Keep raw feedback here, separate from Linear. Only explicit review/promotion creates a Linear item. Preserve every original submission and opt-in when merging. Completed Linear work is ready for release review, never automatic proof it shipped. Release emails are individually addressed and deduplicated; do not send until an owner approves the release.

Read README.md for actual implementation status and blockers. Do not claim draft email generation is delivery, manual sync is a webhook, or local SQLite tests are production verification. Never commit secrets or customer data. Use the existing public GitHub repo luminagency-cloud/mib. Do not change its visibility or deploy into a different account without user direction.

Run npm test and syntax-check edited browser JavaScript. Before broad deployment verify real D1, browser interaction and authentication. Keep UI copy plain and avoid infrastructure details in customer-facing feedback.
