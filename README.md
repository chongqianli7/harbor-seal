# Harbor Seal

Harbor Seal records who stewards a public GitHub Pages project. The registry issues a seal only after GenLayer validators independently retrieve a wallet-bound proof published on the project site. During handover, the existing steward nominates a successor and the successor publishes the next proof and signs the acceptance transaction. The registry changes stewardship atomically and preserves a public journal.

[Open Harbor Seal](https://chongqianli7.github.io/harbor-seal/) · [Studionet contract](https://explorer-studio.genlayer.com/address/0x6d6657926C2EcEC0E5D2552995cE83d85cC3Fa1D)

## Use the registry

1. Enter a lowercase GitHub Pages project path such as `account/project`.
2. For a new seal, create a temporary Studionet wallet and download the generated proof. Publish it at the indicated file URL in the Pages output.
3. Verify and claim. The signing desk identifies the action and signer. The record updates after a finalized, successful transaction.
4. To hand over stewardship, nominate the successor's wallet. The successor publishes its own proof for the next revision, then verifies and accepts the handover.
5. Anyone can inspect the current steward and the chain journal. The current steward may also cancel a nomination or release a seal.

Temporary wallets are generated using SDK signing accounts and kept in browser memory. Reloading removes them. Preserve control of any address used for a continuing workflow. The public example is a test record with ephemeral signers.

## Consensus and state

The contract derives the HTTPS proof URL from validated account and project slugs. The proof binds the deployment registry ID, site, revision, and signing address. Validators each perform their own request inside `strict_eq`, comparing the normalized proof digest or an exact failure code. Only an agreed valid digest permits a claim or handover. Missing, malformed, unavailable and disagreeing evidence cannot advance the state. Cancellations and releases invalidate the next outstanding proof revision.

The seal represents evidence observed at a particular consensus execution. It can remain active after the Pages publisher changes or removes the proof. It grants no GitHub permissions, settles no real assets, and has no administrator recovery. It supports lowercase project names using letters, digits and hyphens on the default GitHub Pages hostname. Custom domains, account-root sites and private sites are outside its scope. The owner and current nominee are public. Pages and its caching still determine which bytes are observable.

## Development

Requires Node.js 22 or compatible, npm, and Python 3. The application uses GenLayer SDK 1.1.8 on Stable Studionet, chain ID 61999.

```sh
npm ci
npm test
npm run dev
npm run build
```

The unit suite uses a host adapter to exercise failure and disagreement cases. `public/deployment.json` records the live contract deployment. `npm run deploy` creates a new registry using a temporary in-memory SDK wallet. Retain the old deployment record before deliberately replacing it.

## Live acceptance

The public example shows a finalized claim, nomination and transfer signed with two independent browser-memory test wallets. A third browser wallet was shown read-only controls during the pending handover. Separate signed transactions tested duplicates, stale revisions and unauthorized actions. Missing proof files were tested before publication and with an unregistered project path. Every receipt is preserved in [the transaction ledger](public/evidence.json).

Use `npm run verify` to re-read the deployment, receipts, final registry record and journal, and validate the two published proof digests. This command is read-only. Use `npx playwright install chromium` and `npm run test:ui` to check the responsive browser layout and wallet lifecycle. Disagreeing observations and HTTP 503 are covered in the unit suite. The public RPC does not expose GenVM debug traces for deterministic rejection reasons, so the ledger retains the observed execution result and includes an exact source error when exposed by the consensus output.
