import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {chain, client, outcome} from '../network.js'

const load = async name => JSON.parse(await readFile(new URL('../public/' + name, import.meta.url)))
const deployment = await load('deployment.json')
const evidence = await load('evidence.json')
assert.equal(chain.id, 61999)
const deployed = await client.getTransaction({hash:deployment.hash})
assert.equal(outcome(deployed, deployment.hash).status, 'FINALIZED')
assert.equal(outcome(deployed, deployment.hash).execution, 'SUCCESS')
assert.equal(deployed.to_address.toLowerCase(), deployment.address.toLowerCase())
const read = (functionName, args) => client.readContract({
  address:deployment.address, functionName, args, stateStatus:'finalized',
})
assert.equal(await read('context', []), deployment.registry)

for (const row of evidence) {
  const receipt = await client.getTransaction({hash:row.hash})
  assert.deepEqual(outcome(receipt, row.hash), {
    hash:row.hash, status:row.status, consensus:row.consensus, execution:row.execution, reason:row.reason,
  })
  assert.equal(row.status, 'FINALIZED')
  assert.equal(receipt.from_address.toLowerCase(), row.actor)
}
const site = 'chongqianli7/harbor-seal'
const journal = JSON.parse(await read('history', [site, 0]))
const final = JSON.parse(await read('record', [site]))
const example = evidence.filter(row => row.site === site && row.event)
assert.deepEqual(journal.map(row => row.action), ['TRANSFERRED', 'NOMINATED', 'CLAIMED'])
for (const row of journal) {
  assert.equal(row.actor, example.find(entry => entry.event === row.events)?.actor)
  if (!row.source) continue
  const response = await fetch(row.source, {signal:AbortSignal.timeout(15000)})
  assert.equal(response.status, 200)
  const body = (await response.text()).replace(/[\r\n]+$/, '')
  assert.equal(createHash('sha256').update(body).digest('hex'), row.digest)
}
assert.deepEqual(final, {owner:journal[0].actor, nominee:'', revision:2, events:3})
console.log(JSON.stringify({site, final, verifiedTransactions:evidence.length + 1}, null, 2))
