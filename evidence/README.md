# Expiring stewardship evidence

The accepted baseline is recorded in [the V1 commit marker](../public/history/v1/commit.txt), [V1 deployment](../public/history/v1/deployment.json) and [V1 receipts](../public/history/v1/evidence.json).

V2 checks the signed transaction timestamp and stores the observed lease deadline in the finalized journal. The live exercise uses three distinct disposable SDK signers and real proof files published at the existing GitHub Pages project. The short two-minute lease tests genuine expiry on Stable Studionet 61999. The normal renewal uses seven days.

The [browser receipt index](../public/evidence.json) links the deployment, claim, nomination, expired acceptance, stale proof revision, renewal, successful transfer, unauthorized acceptance, missing proof and cancellation. The detailed milestone JSON preserves finalized state readbacks and proof digests. Expected rejections are retained with their actual execution results. The journal is independent of the lifetime of the signing keys.

[Official GenVM lint and exact source SHA-256](lint-v2.txt). The deployment payload was compared byte for byte to the source passed to the linter.

Run `npm test` for the isolated host tests, including the exact deadline boundary and validator disagreement. Run `npm run verify` for the wallet-free network recheck.

The [earlier rehearsal](rehearsal-sdk-error.json) recorded a runtime error in the older SDK's error namespace. The corrected deployment uses the SDK's `gl.vm.UserError` and records the exact business rejection codes. The earlier receipts and proof files remain available for inspection.

## Browser verification

Chromium checked real finalized readback, seal rotation by pointer and keyboard, revision replay, ephemeral wallet isolation and horizontal overflow at 1440px, 390px and 320px. Viewport evidence: [desktop](viewport-1440.png) and [narrow](viewport-390.png). The browser harness relayed Studio RPC responses through the test environment's network path.
