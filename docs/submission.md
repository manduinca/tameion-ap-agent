# Tameion hackathon submission

The Tameion AP Agent submission was received by the Canteen Google Form on **October 16, 2026 at 19:18 America/Lima** (October 17 at 00:18 UTC). The confirmation page displayed **“Se registró tu respuesta.”** This records delivery of the application; judging results are pending.

## Submitted materials

- [Public source branch](https://github.com/manduinca/tameion-ap-agent/tree/codex/tameion-mvp)
- [Event code comparison](https://github.com/manduinca/tameion-ap-agent/compare/8f270b3...codex/tameion-mvp)
- [Video demo](https://youtu.be/JPZV6APe-EQ), 2:08, unlisted and verified accessible without signing in
- [Draft pull request](https://github.com/manduinca/tameion-ap-agent/pull/1), open without a merge
- [Confirmed fixture payment](https://explorer.testnet.arc.io/tx/0x3e5e7687c645e2231532fe1e236d5f1460a2debd30045adffdb0a219f327e88c)

Jean Pierre Mandujano applied solo, for his first Canteen × Arc hackathon. The application included the problem, implementation, traction, and Circle/Arc feedback. The optional live URL was left blank because the report runs locally. Arc OSS participation and the optional feedback call were not selected.

## Validation reported

The Solidity/JavaScript build and **19 tests passed**. The fixture workflow confirmed one payment of **0.10 test USDC**, and replay produced no additional transfer and used zero model tokens. The deployed contract rejected duplicate and unauthorized calls. Public chain identifiers and checks are in [verification.json](verification.json).

The real-source pilot involved **one internal business and one founder/operator**. Two authenticated invoice notifications represented one unique invoice; the duplicate was held and the original escalated for missing due date and exceeding demo limits. Odoo returned zero vendor bills. There were **zero real-source payments**. Odoo and email access remained read-only.

Execution uses Arc testnet and vendor test wallets. Demo owner and operator wallets share one Circle developer account. Mainnet settlement and independent administrative custody remain outside the MVP.

## Evidence and continuation

The exact submitted payload, submission timestamp, and private response-edit URL are stored in ignored `data/submission.json`. Upload consent is in ignored `data/youtube-upload-consent.json`; video sources and export are in ignored `data/demo-video/`. These files and real invoice details must remain private.

The [published demo notes](demo-script.md) describe the chapters, original export, and synthetic narration. Continue implementation and operational tracking in this repository. Discord membership, Canteen CLI login, and optional Circle integrations are follow-up items; the form submission is complete.
