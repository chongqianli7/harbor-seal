import {readFileSync, writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import {createAccount} from 'genlayer-js'
import {client, finalized, outcome} from '../network.js'

const registry = randomBytes(16).toString('hex')
const hash = await client.deployContract({
  account: createAccount(),
  code: readFileSync(new URL('../contracts/harbor_seal.py', import.meta.url), 'utf8'),
  args: [registry],
})
console.log(hash)
const receipt = await finalized(hash)
const deployment = {registry, ...outcome(receipt, hash), address: receipt.data?.contract_address ?? receipt.to_address}
console.log(JSON.stringify(deployment))
if (deployment.execution !== 'SUCCESS') process.exit(1)
writeFileSync(new URL('../public/deployment.json', import.meta.url), JSON.stringify(deployment, null, 2) + '\n')
