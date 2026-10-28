# Tameion AP Agent

Accounts-payable agent for Deep Skill, built for the [Tameion Agents Hackathon](https://tameion.thecanteenapp.com/).

The agent reads supplier records, checks duplicates and spending policy, obtains a structured recommendation from **Muse Spark 1.3 Contributor**, and pays, holds, or escalates. Payments go through a treasury contract on **Arc testnet**. Decisions and receipts are recorded in a local SQLite audit journal. **Odoo and email remain read-only.**

[Watch the demo (2:08)](https://youtu.be/JPZV6APe-EQ) · [Chapters and recording details](docs/demo-script.md)

## Hackathon submission

Submitted and confirmed on **October 16, 2026 at 19:18 America/Lima**. See the [submission record](docs/submission.md) for delivered materials, reported validation, and private evidence locations. Latest result check: **October 27, 2026**; no outcome has been confirmed for this submission.

## Verified MVP

On 2026-10-16 a real Muse API call recommended the eligible fixture payment. Circle executed **0.10 test USDC** through the deployed treasury. The application matched the successful receipt's invoice hash, recipient, amount, and category against the contract Payment event. Repeating the invoice created no new transfer and made no LLM call. Independent eth_call checks confirmed that the deployed contract rejects duplicates and unauthorized callers.

- [Treasury deployment](https://explorer.testnet.arc.io/tx/0x9c5b1c82961435afee551f15d7f0322b31ac946acbd8fe5e6c11ab1cf483e193)
- [Confirmed fixture payment](https://explorer.testnet.arc.io/tx/0x3e5e7687c645e2231532fe1e236d5f1460a2debd30045adffdb0a219f327e88c)
- Contract: `0xe37a02d69fcee82a656348cd8629411a92967472`
- Machine-readable evidence: [docs/verification.json](docs/verification.json)

All transfers use test tokens and vendor test wallets. They do not settle real supplier obligations. Fixture transactions are excluded from real-usage counts.

## Setup

Requires Node.js **22.18+**, Python 3.9+ for IMAP, and optional Poppler `pdftotext` for PDF attachments.

```bash
npm ci
cp -n .env.example .env
# Fill the ignored .env locally; never commit credentials.
npm run build
npm test
npm run demo
```

`demo` runs six labeled fixtures with an **offline policy baseline**, without API calls or transfers. Tests exercise policy, audit/idempotency, read-only Odoo, LLM validation, and Solidity on an in-memory EVM. Ganache falls back to JavaScript when optional native bindings do not support the installed Node version.

| Variable | Purpose |
| --- | --- |
| CIRCLE_API_KEY | Circle testnet API key |
| CIRCLE_ENTITY_SECRET | Registered Circle entity secret |
| MODEL_API_KEY | Meta Model API key |
| LLM_MODEL | Defaults to muse-spark-1.3-contributor |
| ODOO_ENV_FILE | Optional shared env file containing Odoo and Gmail credentials |
| AP_DATA_DIR | Private journal/report directory; defaults to data/ |
| AP_WALLETS_FILE | Private wallet mapping; defaults to wallets.json beside the env file |
| AP_ENV_FILE | Explicit project env path |

The original `scripts/setup.mjs` creates six role wallets only when wallets.json is missing. Existing wallets and credentials do not need recreation.

## Run with Muse and Arc testnet

```bash
npm run check:llm
npm run prepare:testnet -- --fund 3.00
npm run run -- --source fixture --execute-testnet
npm run run -- --source fixture --limit 1 --execute-testnet # idempotent replay
npm run serve
```

Open http://127.0.0.1:4767. The read-only report has source filters, rationales, transaction links, source counts, and audit verification. Invoice counts merge duplicate references; email invoices require authenticated senders and verified amount evidence. It exposes no payment or ERP mutation endpoints.

Deployment and funding identifiers are persisted. Reusing a data directory reuses the same treasury; preparation does not automatically refill spent funds. Pending payments retain their original idempotency key and rationale for reconciliation.

## Real source records

```bash
# ODOO_ENV_FILE points to the private shared credentials file.
AP_DATA_DIR=data/real npm run run -- --source odoo --since 2026-10-01 --local-review
AP_DATA_DIR=data/real npm run run -- --source email --since 2026-10-01 --limit 10 --local-review
```

The Odoo adapter only exposes authentication and paginated account.move.search_read. IMAP uses EXAMINE and BODY.PEEK, preserving read flags, and checks Gmail DMARC against the sender. PDF text is extracted locally when Poppler is available. Missing fields, evidence, or authentication cause escalation.

On 2026-10-16 Odoo returned **zero vendor bills**. After JP explicitly authorized the previously discovered email batch, Muse extracted fields from **two Google Workspace invoice notifications**. Local checks verified their references and amounts against the email text, with authenticated senders. Both notifications refer to **one unique invoice**: one duplicate was held and the original escalated because its due date was absent and its amount exceeded the demo limit. No real-source payment was executed. The card alert and marketing email from the original search were excluded.

The scoped run used two extraction requests (2,868 input and 1,156 output tokens). Policy review stayed local. Consent, source IDs, extraction results, verification checks, and the hash-linked journal remain private under data/real/.

### Contributor data consent

Contributor permits Meta to use inputs and responses for training. JP selected the model on 2026-10-15. Real invoice data is blocked by default in both CLI and LLM client. The private AP_ALLOW_REAL_DATA_TO_CONTRIBUTOR setting remains disabled. The authorized extraction used an isolated client whose caller checked a frozen allowlist of the two source IDs before each request; it did not enable future or unrelated document processing. The --local-review mode keeps documents local, cannot pay, and escalates fields that have not been extracted and verified. Additional real documents require their own authorization.

## Policy and custody boundaries

- The LLM returns only action, reason, and confidence, validated against JSON Schema. It never supplies amounts, destinations, categories, raw transactions, or credentials.
- Trusted code fixes recipients and categories. Amount conversion uses integer arithmetic. Unsupported currencies are escalated; no implicit PEN-to-USDC conversion.
- The contract enforces operator/owner roles, vendor allowlisting, replay protection, transaction limits, total/category budgets, and exact owner approval above the automatic limit.
- Demo limits: 1 USDC automatic, 3 USDC absolute per transaction, 5 USDC total per fixed 30-day epoch. Epochs are not calendar months.
- Owner approval binds invoice, vendor, amount, and category. The agent exposes no approval tool. Mainnet chain IDs and non-test Circle keys are rejected.
- The local append-only, hash-linked journal provides tamper detection, not independent immutable accounting. Receipts provide separate onchain settlement evidence.
- Owner/operator demo wallets share one Circle developer account. Production requires independent administrative credentials, approval custody, deployment review, and a contract audit.

Private data, wallet mappings, compiled artifacts, SQLite files and secrets are ignored by Git. After a forced interruption, confirm the process exited before removing data/.run.lock.

## Outside this MVP

Mainnet or fiat settlement, Odoo write-back, FX, swap/bridge/Gateway extras, and independent owner custody. Fixtures demonstrate payment, duplicate hold, approval escalation, unknown vendor, paid bill, and unsupported currency. They are not six real customers or invoices.

## References

- [Circle Contracts deployment](https://developers.circle.com/contracts/scp-deploy-smart-contract)
- [Arc configuration](https://docs.arc.io/arc/references/connect-to-arc)
- [Meta structured output](https://dev.meta.ai/docs/structured-output)
