import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {chain, client, read, outcome} from '../network.js'

const load = async name => JSON.parse(await readFile(new URL('../public/' + name, import.meta.url)))
const deployment = await load('deployment.json')
const evidence = await load('evidence.json')
assert.equal(chain.id, 61999)
assert.equal(deployment.version, 2)
const deployed = await client.getTransaction({hash:deployment.hash})
assert.equal(outcome(deployed, deployment.hash).status, 'FINALIZED')
assert.equal(outcome(deployed, deployment.hash).execution, 'SUCCESS')
assert.equal(deployed.data.contract_address.toLowerCase(), deployment.address.toLowerCase())
const source = await readFile(new URL('../contracts/harbor_seal.py', import.meta.url))
const payload = deployed.data.contract_code
assert([Buffer.from(payload,'base64'),Buffer.from(payload),Buffer.from(payload.replace(/^0x/,''),'hex')].some(b=>b.equals(source)))
assert.equal(createHash('sha256').update(source).digest('hex'), deployment.sourceSha256)
assert.equal(await read(deployment.address,'context'), deployment.registry)
for (const row of evidence) {
  const receipt = await client.getTransaction({hash:row.hash})
  assert.equal(outcome(receipt, row.hash).status, 'FINALIZED')
  assert.equal(outcome(receipt, row.hash).execution, row.execution)
  assert.equal(receipt.from_address.toLowerCase(), row.actor)
}
const site = 'chongqianli7/harbor-seal'
const journal = JSON.parse(await read(deployment.address,'history',[site,0]))
const final = JSON.parse(await read(deployment.address,'record',[site]))
const snapshot = JSON.parse(await readFile(new URL('../evidence/milestone-'+deployment.registry+'.json',import.meta.url)))
assert.deepEqual(journal, snapshot.journal)
assert.deepEqual(final, snapshot.readbacks[evidence.length])
for (const row of journal.filter(event=>event.source)) {
  const response=await fetch(row.source,{signal:AbortSignal.timeout(15000)})
  assert.equal(response.status,200)
  const body=(await response.text()).replace(/[\r\n]+$/,'')
  assert.equal(createHash('sha256').update(body).digest('hex'),row.digest)
}
console.log(JSON.stringify({site, final, verifiedTransactions:evidence.length}, null, 2))
