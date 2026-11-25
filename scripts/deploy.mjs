import {readFileSync, writeFileSync} from 'node:fs'
import {createHash, randomBytes} from 'node:crypto'
import {createAccount} from 'genlayer-js'
import {client, finalized, outcome, fund} from '../network.js'

const output = process.argv[2]
if (!output) throw Error('Supply an unused deployment output filename')
const registry = randomBytes(16).toString('hex')
const source = readFileSync(new URL('../contracts/harbor_seal.py', import.meta.url), 'utf8')
const account = createAccount()
await fund(account.address)
for(let i=0; await client.getBalance({address:account.address})===0n; i++){
  if(i===20)throw Error('Faucet balance unavailable')
  await new Promise(r=>setTimeout(r,2000))
}
const hash = await client.deployContract({account, code:source, args:[registry], fees:await client.estimateTransactionFees()})
console.log(hash)
const receipt = await finalized(hash)
const deployment = {registry, ...outcome(receipt, hash), address:receipt.data?.contract_address,version:2,sourceSha256:createHash('sha256').update(source).digest('hex')}
if (deployment.status !== 'FINALIZED' || deployment.execution !== 'SUCCESS') throw Error(JSON.stringify(deployment))
writeFileSync(output, JSON.stringify(deployment, null, 2) + '\n',{flag:'wx'})
console.log(JSON.stringify(deployment))
