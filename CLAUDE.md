# Tameion AP Agent

- Runtime: Node ESM; Python stdlib IMAP helper.
- Odoo and email are **read-only**. No write/create/post/reconcile calls, SMTP or sending.
- Payments are Arc testnet only. Preserve chain and credential checks.
- LLM: muse-spark-1.3-contributor. Keys belong only in ignored .env; never log secrets or raw SDK errors.
- Real data may reach Contributor only after explicit permission for payload/destination. Preserve CLI and LLM-client opt-in gates.
- config/policy.json is trusted policy. The model cannot control amounts, recipients, categories or approvals.
- Separate fixtures, real documents, validated invoices and real payments in all metrics.
- Build: npm run build. Tests: npm test. Offline demo: npm run demo. Report: npm run serve.
- data/, .env, wallet mappings and secrets/ are private. Preserve operation IDs on retries.
- AGENTS.md is a symlink to this file. Edit this source.
