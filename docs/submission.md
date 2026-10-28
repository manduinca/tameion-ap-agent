# Tameion hackathon submission

The Tameion AP Agent submission was received by the Canteen Google Form on **October 16, 2026 at 19:18 America/Lima** (October 17 at 00:18 UTC). The confirmation page displayed **“Se registró tu respuesta.”** This records delivery of the application; no judging outcome has been confirmed for this project as of the October 27 check below.

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

## Result check on October 27 2026

**No award, selection, rejection, or individual feedback has been confirmed for this submission.** The registration mailbox was searched for Tameion/Canteen messages from October 16 through October 27, including archived mail, spam, and trash. It returned the form receipt and two organizer notices from October 16, with no later matching messages. IMAP access was read-only and message read flags were verified unchanged.

The [official event website](https://tameion.thecanteenapp.com/) still describes asynchronous judging; this review found no published Tameion winners there. The [official showcase](https://arc-showcase.thecanteenapp.com/) includes Tameion projects, while its visible award categories cover Agora and Lepton. Discord announcements were not verified. Receipt of the application and a judging outcome remain separate statuses.

The private mail review is preserved in ignored `data/status-reviews/2026-10-27.json`. Raw mail, contact details, and private links are excluded from this public record.

Follow-up remains to ask the organizer for a results date and project feedback. No follow-up email was drafted or sent during this review.
