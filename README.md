# Harbor Seal

Harbor Seal records who stewards a public GitHub Pages project. GenLayer validators independently retrieve a wallet-bound proof published on the project site. The contract issues a time-limited seal and records who verified, renewed, nominated, accepted, canceled or released it.

[Open Harbor Seal](https://chongqianli7.github.io/harbor-seal/) · [Original registry](https://explorer-studio.genlayer.com/address/0x6d6657926C2EcEC0E5D2552995cE83d85cC3Fa1D) · [Current deployment](public/deployment.json)

## Milestone · Expiring stewardship and verified renewal

The accepted registry supported initial claim and transfer with public proof. V2 adds an expiration timestamp taken from deterministic GenVM transaction context. An expired seal retains its steward and journal, while nomination and acceptance require a valid seal. Only the current steward can renew. Renewal consumes a fresh proof revision and clears outstanding nominations, so an earlier transfer proof cannot race a renewal.

Claim and renewal accept a lease between two minutes and 30 days. The app defaults to seven days and offers one-day and 30-day choices. Transfer starts a new lease of the same duration. Cancellation advances the proof revision without extending the lease. Release clears the owner, nomination and deadline. Older V1 records remain at the original deployment. A site using V2 makes a fresh claim using a V2 proof.

## Use the registry

1. Enter a lowercase GitHub Pages project path such as `account/project`. Visitors can inspect its current validity and history.
2. Create a temporary test wallet and request Stable Studionet faucet GEN when needed. Download the proof and publish it at the indicated path in that project's public Pages output.
3. Choose the claim or renewal duration. Verify and sign. The site waits for a finalized successful receipt and rereads the record.
4. While the seal is valid, nominate a separate successor. The successor publishes the next revision's proof and verifies acceptance from their wallet.
5. Inspect the journal and link to individual receipts. The three-dimensional seal accepts pointer drag and arrow keys and changes appearance with the selected record's validity.

Temporary wallets are generated using the SDK and kept in browser memory. Closing or reloading clears those signers. The public example uses disposable test wallets.

## Consensus and state

The verifier derives a GitHub Pages HTTPS URL containing the registry ID and revision. The proof binds the registry, project, revision and signing wallet. Validators independently fetch the file and compare a normalized proof digest or exact failure code using `strict_eq`. A missing, malformed or unavailable proof leaves the record unchanged. The contract enforces expiry during writes using transaction time. The website displays expiry using the browser clock.

A seal records matching proof evidence at a particular verification. Between verifications a project can change or remove the file. Harbor Seal grants no GitHub permissions and supports public project sites on the default GitHub Pages hostname.

## Build and inspect

Node.js 22+, Python 3 and GenLayer JS 2.0.0. Network is Stable Studionet 61999 at `https://studio.genlayer.com/api`.

```sh
npm ci
npm test
npm run build
npm run verify
```

`npm run verify` reads finalized transactions and state, verifies stored proof digests and compares the deployment payload against the contract source. To deploy a fresh registry, run `npm run deploy -- evidence/new-deployment.json`. That command requires an unused filename and does not change the app's active deployment. See [chain evidence and checks](evidence/README.md) and [V1 deployment history](public/history/v1/deployment.json).
