# Published demo

[Watch Tameion AP Agent on YouTube](https://youtu.be/JPZV6APe-EQ).

The 2:08 walkthrough covers the read-only invoice pipeline, bounded model recommendations, guarded Arc testnet execution, and verified replay. The video is unlisted and accessible by link without signing in. It uses captured application states, the public transaction receipt, diagrams, and actual replay output, with synthetic English narration and burned-in subtitles.

| Start | Chapter |
| --- | --- |
| 00:00 | Accounts payable with a decision trail |
| 00:12 | Read sources. Bound the model. Verify execution. |
| 00:28 | Pay, hold, or escalate |
| 00:43 | A public receipt on Arc testnet |
| 00:59 | Spending authority enforced in Solidity |
| 01:16 | Replay: no second payment |
| 01:31 | One internal business, verified source evidence |
| 01:50 | Reproducible code and evidence |

The payment is a fixture transfer of **0.10 test USDC**, with its [verified receipt](https://explorer.testnet.arc.io/tx/0x3e5e7687c645e2231532fe1e236d5f1460a2debd30045adffdb0a219f327e88c). Replay created no additional transfer and used zero model tokens. Real-source validation covers two authenticated invoice notifications representing one unique invoice; one duplicate was held and the original escalated. No real supplier obligation was settled. Private invoice contents are excluded from the video.

Original export: 1920×1080 H.264/AAC, 127.897 seconds, 3,903,207 bytes. SHA-256: `2d762bc3b7bc07ba518300a69c46e308663e32441be5957d9a9353f91fa22af5`. Source captures, narration, transcript, and render inputs are kept locally in the ignored `data/demo-video/` directory.
