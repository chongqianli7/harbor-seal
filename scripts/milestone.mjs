import assert from 'node:assert/strict'
import {randomBytes, createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {createAccount, createClient} from 'genlayer-js'
import {client, chain, finalized, outcome, read, fund} from '../network.js'

const sitename = process.argv[2]
assert.match(sitename ?? '', /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,62}$/)
const [ownerSlug, projectSlug] = sitename.split('/')
const root = `https://${ownerSlug}.github.io/${projectSlug}/`
const registry = randomBytes(16).toString('hex')
const wallets = [createAccount(),createAccount(),createAccount()]
const [steward,successor,observer] = wallets
const proofs = [[1,steward],[2,steward],[3,successor]]
for(const [revision,actor] of proofs) {
  const name = 'harbor-v2-proof-'+registry+'-'+revision+'.txt'
  writeFileSync('public/'+name, 'harbor-seal:v2:'+registry+':'+sitename+':'+revision+':'+actor.address.toLowerCase()+'\n')
}
console.log('Publish public/harbor-v2-proof-'+registry+'-*.txt')
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
const source = readFileSync('contracts/harbor_seal.py','utf8')
const deploymentHistory = 'evidence/milestone-'+registry+'.json'
const results = []
const snapshot = {registry,sourceSha256:createHash('sha256').update(source).digest('hex'),transactions:results,readbacks:{}}
const save = () => writeFileSync(deploymentHistory,JSON.stringify(snapshot,null,2)+'\n')
const evm = wallets.map(account=>createClient({chain,account}))
let address
const pending = []
let fees
async function record(method, wallet, args, expected='SUCCESS', label=method) {
  const hash = method === 'deploy'
    ? await wallet.deployContract({code:source,args:[registry],fees})
    : await wallet.writeContract({address,functionName:method,args,value:0n,fees})
  const row={method,label,hash,actor:wallet.account.address.toLowerCase(),site:sitename}
  results.push(row);save();console.log(label,hash)
  pending.push(finalized(hash).then(raw=>{
    Object.assign(row,outcome(raw,hash))
    save()
    return row.status==='FINALIZED'&&row.execution===expected
  }).catch(error=>{console.error(error.message);return false}))
  const raw=await client.waitForTransactionReceipt({hash,waitUntil:'decided',interval:2500,retries:100,fullTransaction:true})
  assert.equal(outcome(raw,hash).execution,expected,label+': '+outcome(raw,hash).reason)
  return raw
}
assert.equal(chain.id,61999)
await Promise.all(wallets.map(w=>fund(w.address)))
for(const wallet of wallets){
  for(let i=0;;i++){
    if(await client.getBalance({address:wallet.address})>0n)break
    assert(i<15,'Faucet timed out')
    await pause(2500)
  }
}
fees = await client.estimateTransactionFees()
const deployed=await record('deploy',evm[0],[])
address=deployed.data.contract_address
const code=deployed.data.contract_code
assert([Buffer.from(code,'base64'),Buffer.from(code),Buffer.from(code.replace(/^0x/,''),'hex')].some(b=>b.equals(Buffer.from(source))))
snapshot.address=address
snapshot.deployedSourceMatches=true
save()
console.log('DEPLOYED',address)
for(let attempt=0;;attempt++){
  const answers=await Promise.all(proofs.map(async ([revision])=>{
    const name='harbor-v2-proof-'+registry+'-'+revision+'.txt'
    try{
      const response=await fetch(root+name,{signal:AbortSignal.timeout(12000),cache:'no-store'})
      return response.ok&&(await response.text()).trim()===readFileSync('public/'+name,'utf8').trim()
    }catch{return false}
  }))
  if(answers.every(Boolean))break
  assert(attempt<125,'Proof publication timed out')
  await pause(5000)
}
const [owner,next,third]=evm
const state = async () => JSON.parse(await read(address,'record',[sitename]))
await record('claim',owner,[sitename,1,120])
await record('nominate',owner,[sitename,successor.address])
for(let i=0;i<40;i++){
  const current=await state()
  if(current.nominee===successor.address.toLowerCase())break
  assert(i<39,'Nomination readback did not settle')
  await pause(3000)
}
const published=await state()
snapshot.readbacks.beforeExpiry=published;save()
await pause(Math.max(0,published.expires_at*1000-Date.now()+6000))
await record('accept',next,[sitename,2],'ERROR','expired_acceptance')
assert.deepEqual(await state(),published)
await record('renew',owner,[sitename,1,604800],'ERROR','stale_renewal')
assert.deepEqual(await state(),published)
await record('renew',owner,[sitename,2,604800])
await record('nominate',owner,[sitename,successor.address])
await record('accept',third,[sitename,3],'ERROR','unauthorized_acceptance')
await record('accept',next,[sitename,3])
await record('nominate',next,[sitename,observer.address])
await record('accept',third,[sitename,4],'ERROR','missing_proof')
await record('cancel',next,[sitename])
assert((await Promise.all(pending)).every(Boolean))
const transferred=await state()
assert.equal(transferred.owner,successor.address.toLowerCase())
assert(transferred.expires_at>published.expires_at)
snapshot.readbacks[results.length]=transferred
const labels = {claim:'CLAIMED', renew:'RENEWED', nominate:'NOMINATED', accept:'TRANSFERRED', cancel:'CANCELED'}
const reasons = {expired_acceptance:'SEAL_EXPIRED',stale_renewal:'STALE_REVISION',unauthorized_acceptance:'NOMINEE_REQUIRED',missing_proof:'HTTP_404'}
for(const row of results.filter(row=>row.label in reasons))assert.equal(row.reason,reasons[row.label],row.label)
const history=JSON.parse(await read(address,'history',[sitename,0]))
assert.deepEqual(history.map(row=>row.action),['CANCELED','NOMINATED','TRANSFERRED','NOMINATED','RENEWED','NOMINATED','CLAIMED'])
const applied=results.filter(row=>row.execution==='SUCCESS'&&row.method!=='deploy')
for(const [index,event] of [...history].reverse().entries()){
  const row=applied[index]
  assert.equal(event.actor,row.actor)
  assert.equal(event.action,labels[row.method])
  row.event=event.events
}
snapshot.journal=history;save()
writeFileSync('public/deployment.json',JSON.stringify({registry,address,hash:results[0].hash,status:'FINALIZED',execution:'SUCCESS',version:2,sourceSha256:snapshot.sourceSha256},null,2)+'\n')
writeFileSync('public/evidence.json',JSON.stringify(results,null,2)+'\n')
