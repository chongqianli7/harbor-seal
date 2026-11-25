import {createAccount} from 'genlayer-js'
import {formatEther, isAddress} from 'viem'
import {client, finalized, outcome, explorer, read as readFinal, fund} from './network.js'
import './style.css'
import {setSealState} from './seal.js'

const $ = id => document.getElementById(id)
const lookup = $('lookup')
const input = $('site-input')
const wallets = []
let active = null
let deployment
let evidence = []
let site = ''
let state = null
let working = false
let generation = 0
let historyCursor = 0
let replayEvent = null
const journalLabels = {CLAIMED:'Proof verified · seal issued', NOMINATED:'Successor nominated', TRANSFERRED:'Proof verified · seal transferred', RENEWED:'Proof reverified · seal renewed', CANCELED:'Nomination canceled', RELEASED:'Seal released'}
const txUrl = hash => explorer + '/transactions/' + hash
const node = (tag, text, className) => {
  const element = document.createElement(tag)
  element.textContent = text
  if (className) element.className = className
  return element
}
function link(text, url) {
  const element = node('a', text)
  element.href = url
  return element
}
function button(text, handler, className) {
  const element = node('button', text, className)
  element.type = 'button'
  element.disabled = working
  element.onclick = handler
  return element
}
const say = message => { $('feedback').textContent = message }
const canon = value => value.trim().toLowerCase()
const accountAddress = () => active?.address.toLowerCase()
const sourceUrl = (key, revision) => {
  const [owner, repo] = key.split('/')
  return `https://${owner}.github.io/${repo}/harbor-v2-proof-${deployment.registry}-${revision}.txt`
}
const read = (functionName, args = []) => readFinal(deployment.address,functionName,args)
const expired = () => Boolean(state?.owner && state.expires_at && Date.now() >= state.expires_at * 1000)
const utc = time => new Date(time * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC'
let expirationTimer
function remainingValidity() {
  return Math.max(0,Math.min(state.lease_seconds,state.expires_at - Math.floor(Date.now()/1000)))
}
function scheduleExpiry() {
  clearTimeout(expirationTimer)
  if (!state?.owner || !state.expires_at || expired()) return
  expirationTimer = setTimeout(() => {
    if (expired()) {
      renderRecord()
      renderActions()
      return
    }
    const gauge = $('record').querySelector('meter')
    if (gauge) gauge.value = remainingValidity()
    scheduleExpiry()
  }, Math.min(state.expires_at * 1000 - Date.now() + 100, 15000))
}

function renderRecord() {
  const record = $('record')
  record.replaceChildren(node('p', 'STEWARDSHIP SEAL', 'eyebrow'))
  if (!state) {
    setSealState('unregistered','Choose a site to read its seal')
    record.append(node('h3', 'Select a project'), node('p', 'Read the public record with no wallet required.'))
    return
  }
  const title = node('h3', site)
  const label = state.owner ? (expired() ? 'Expired seal' : state.nominee ? 'Handover pending' : 'Active seal') : (state.events ? 'Released' : 'Unregistered')
  record.append(title, node('p', label, 'status'))
  if (!replayEvent) setSealState(expired() ? 'expired' : state.nominee ? 'pending' : state.owner ? 'active' : 'unregistered', label + ' · Revision ' + state.revision)
  for (const [name, value] of [['Current steward', state.owner || '—'], ['Nominated successor', state.nominee || '—'], ['Current revision', state.revision], ['Valid until', state.expires_at ? utc(state.expires_at) : '—']]) {
    const field = node('div', '', 'field')
    field.append(node('span', name), node('strong', value))
    record.append(field)
  }
  if (state.owner && state.lease_seconds && state.expires_at) {
    const progress = node('meter','')
    progress.max = state.lease_seconds
    progress.value = remainingValidity()
    progress.setAttribute('aria-label','Remaining seal validity')
    record.append(progress)
  }
  record.append(node('p', expired() ? 'The steward must renew before a handover can proceed. The journal remains available.' : state.nominee ? 'The nominated wallet can complete the handover once it publishes the next proof.' :
    state.owner ? 'The steward may nominate a successor or release this seal.' :
      'A site operator can publish a wallet-bound proof and claim the seal.', 'muted'))
}
function renderActions() {
  const panel = $('actions')
  panel.replaceChildren()
  if (!active || !state) return
  const actor = accountAddress()
  const owns = actor === state.owner
  const method = !state.owner ? 'claim' : owns ? 'renew' : actor === state.nominee && !expired() ? 'accept' : null
  if (method) {
    const revision = state.revision + 1
    const proof = `harbor-seal:v2:${deployment.registry}:${site}:${revision}:${actor}`
    const filename = `harbor-v2-proof-${deployment.registry}-${revision}.txt`
    const action = {claim:'Verify and claim', renew:'Verify and renew', accept:'Verify and accept handover'}[method]
    const ttl = node('select','')
    ttl.setAttribute('aria-label','Lease duration')
    for (const [seconds,label] of [[86400,'1 day'],[604800,'7 days'],[2592000,'30 days']]) {
      const option = node('option',label)
      option.value = seconds
      option.selected = seconds === 604800
      ttl.append(option)
    }
    panel.append(node('h4', method === 'renew' ? 'Renew with a fresh proof' : 'Publish the next proof'),
      node('p', method === 'renew' && state.nominee ? 'Renewal cancels the outstanding nomination. Publish the new file before signing.' : 'Publish the proof at the site root and wait for the public file to become available.'),
      node('code', proof), link(filename + ' ↗', sourceUrl(site, revision)),
      button('Download proof', () => {
        const url = URL.createObjectURL(new Blob([proof + '\n'], {type:'text/plain'}))
        const file = link(filename, url)
        file.download = filename
        file.click()
        setTimeout(() => URL.revokeObjectURL(url), 3000)
      }))
    if (method !== 'accept') panel.append(ttl)
    panel.append(button(action, () => submit(method, method === 'accept' ? [revision] : [revision,Number(ttl.value)]), 'primary'))
  }
  if (owns) {
    if (state.nominee) panel.append(button('Cancel nomination', () => submit('cancel')))
    else if (!expired()) {
      const label = node('label', 'Successor wallet')
      label.htmlFor = 'nominee'
      const successor = node('input', '')
      successor.id = 'nominee'
      successor.placeholder = '0x…'
      panel.append(label, successor, button('Nominate successor', () => {
        if (!isAddress(successor.value.trim())) return say('Enter a valid successor wallet address.')
        submit('nominate', [canon(successor.value)])
      }))
    }
    panel.append(button('Release seal', () => submit('release'), 'quiet'))
  } else if (!method) panel.append(node('p', actor === state.nominee ? 'The current steward must renew before you can accept.' : 'Only the current steward or nominated successor can act on this seal.', 'muted'))
}
function renderWallets() {
  $('reset').hidden = !wallets.length
  $('reset').disabled = working
  $('add-wallet').disabled = working || wallets.length >= 3
  const desk = $('wallets')
  desk.replaceChildren()
  if (!wallets.length) return
  const selector = node('select', '')
  selector.setAttribute('aria-label', 'Active test wallet')
  selector.disabled = working
  wallets.forEach((account, index) => {
    const option = node('option', `Test wallet ${index + 1} · ${account.address.slice(0, 8)}`)
    option.value = account.address
    option.selected = account === active
    selector.append(option)
  })
  selector.onchange = () => {
    active = wallets.find(account => account.address === selector.value)
    renderWallets()
    renderActions()
  }
  const balance = node('small', 'Checking balance…')
  desk.append(selector, node('code', active.address), balance, button('Fund test wallet', async () => {
    const wallet = active
    try {
      say('Requesting Stable Studionet faucet funds…')
      await fund(wallet.address)
      if(active === wallet) renderWallets()
      say('Faucet request sent. Recheck your test balance before signing.')
    } catch { say('The test faucet is temporarily unavailable.') }
  }, 'quiet'))
  client.getBalance({address:active.address}).then(value => { balance.textContent = formatEther(value) + ' test GEN' })
    .catch(() => { balance.textContent = 'Balance unavailable' })
}
function renderJournal(events, append) {
  const journal = $('journal')
  if (!append) journal.replaceChildren()
  if (!events.length && !append) journal.append(node('li', 'No finalized journal entries for this site.'))
  for (const event of events) {
    const row = node('li', '')
    row.append(node('span', '#' + event.events, 'journal-number'), node('strong', journalLabels[event.action]),
      node('code', event.actor), node('span', 'Revision ' + event.revision, 'muted'))
    row.append(button('Inspect this revision', () => {
      replayEvent = event
      const onTime = !event.expires_at || event.timestamp < event.expires_at
      setSealState(!event.owner ? 'unregistered' : !onTime ? 'expired' : event.nominee ? 'pending' : 'active',
        'Journal #' + event.events + ' · ' + journalLabels[event.action])
      $('leave-replay').hidden = false
      $('seal-orbit').scrollIntoView({block:'center'})
    }, 'quiet'))
    if (event.timestamp) row.append(node('time',utc(event.timestamp),'muted'))
    if (event.nominee) row.append(node('code', 'Successor ' + event.nominee))
    if (event.source) row.append(link('Proof source ↗', event.source), node('code', 'SHA-256 ' + event.digest))
    const transaction = evidence.find(item => item.site === site && item.event === event.events && item.execution === 'SUCCESS')
    if (transaction) row.append(link('Finalized receipt ↗', txUrl(transaction.hash)))
    journal.append(row)
  }
  if (events.length) historyCursor = events.at(-1).events
  $('older').hidden = historyCursor <= 1
}
function renderBoundaryEvidence() {
  const panel = $('verified-boundaries')
  const labels = {
    'accept:SEAL_EXPIRED':'Expired seal blocked acceptance',
    'renew:STALE_REVISION':'Consumed revision blocked renewal',
    'accept:NOMINEE_REQUIRED':'Unexpected signer blocked acceptance',
    'accept:HTTP_404':'Missing successor proof blocked transfer',
  }
  const failures = evidence.filter(item => item.site === site && item.execution === 'ERROR')
  panel.hidden = !failures.length
  panel.replaceChildren(node('h3','Verified rejection cases'))
  for (const failure of failures) {
    const key = failure.method + ':' + failure.reason
    panel.append(link((labels[key] ?? (failure.method + ' · finalized rejection')) + ' ↗',txUrl(failure.hash)))
  }
}

async function refresh(requested) {
  const request = ++generation
  const changed = requested !== site
  site = requested
  if (changed) {
    state = null
    replayEvent = null
    $('leave-replay').hidden = true
    historyCursor = 0
    $('journal').replaceChildren()
    renderBoundaryEvidence()
    renderRecord()
    renderActions()
  }
  $('read-status').textContent = 'Reading finalized chain state…'
  try {
    const [record, history] = await Promise.all([read('record', [requested]), read('history', [requested, 0])])
    if (request !== generation) return
    state = JSON.parse(record)
    scheduleExpiry()
    renderRecord()
    renderActions()
    renderJournal(JSON.parse(history), false)
    renderBoundaryEvidence()
    $('read-status').textContent = ''
  } catch (error) {
    if (request !== generation) return
    $('read-status').textContent = 'Could not read the finalized record. Try looking up the site again.'
    throw error
  }
}
async function submit(method, args = []) {
  if (working) return
  const key = site
  const previousEvents = state.events
  const signer = active
  const dialog = $('confirm')
  working = true
  renderActions()
  renderWallets()
  $('intent').textContent = `${method.toUpperCase()} · ${key}${args.length ? ' · ' + args.join(', ') : ''}\nStable Studionet (61999)\n${signer.address}`
  dialog.returnValue = ''
  dialog.showModal()
  await new Promise(resolve => dialog.addEventListener('close', resolve, {once:true}))
  let hash
  try {
    if (dialog.returnValue !== 'sign') return
    say('Signing and submitting to Stable Studionet…')
    const calldata = [key, ...args]
    hash = await client.writeContract({address:deployment.address, functionName:method, args:calldata, account:signer, value:0n, fees:await client.estimateTransactionFees()})
    $('receipts').prepend(link('Transaction submitted ↗', txUrl(hash)))
    say('Submitted. Waiting for validator consensus and finalization…')
    const result = outcome(await finalized(hash), hash)
    const receiptLink = $('receipts').firstElementChild
    receiptLink.textContent = `${method} · ${result.status} / ${result.execution} ↗`
    if (result.status !== 'FINALIZED' || result.execution !== 'SUCCESS') {
      say('Chain rejected the operation. ' + (result.reason || 'Inspect the transaction for details.'))
      return
    }
    say('Finalized successfully. Refreshing the chain record…')
    if (site === key) {
      await refresh(key)
      const events = JSON.parse(await read('history', [key, 0]))
      if (site === key) {
        const action = {claim:'CLAIMED', renew:'RENEWED', nominate:'NOMINATED', accept:'TRANSFERRED', cancel:'CANCELED', release:'RELEASED'}[method]
        const event = events.find(item => item.action === action && item.actor === signer.address.toLowerCase() && item.events === previousEvents + 1)
        if (event) evidence.push({site:key, event:event.events, ...result})
        renderJournal(events, false)
      }
    }
    say('Finalized successfully.')
  } catch {
    say(hash ? 'The transaction was sent. Check the Explorer receipt before retrying.' : 'Submission failed before a transaction hash was returned.')
  } finally {
    working = false
    renderWallets()
    renderActions()
  }
}
function route() {
  const key = new URLSearchParams(location.hash.slice(1)).get('site')
  if (!key || !deployment) return
  input.value = key
  refresh(key).catch(() => {})
}
lookup.onsubmit = event => {
  event.preventDefault()
  if (!deployment) return
  const key = canon(input.value)
  const next = '#site=' + encodeURIComponent(key)
  if (location.hash === next) route()
  else location.hash = next
}
window.addEventListener('hashchange', route)
$('leave-replay').onclick = () => {
  replayEvent = null
  $('leave-replay').hidden = true
  renderRecord()
}
$('older').onclick = async () => {
  const current = generation
  $('older').disabled = true
  try {
    const records = await read('history', [site, historyCursor])
    if (current === generation) renderJournal(JSON.parse(records), true)
  } catch {
    $('read-status').textContent = 'Could not load earlier journal entries.'
  } finally {
    $('older').disabled = false
  }
}
$('add-wallet').onclick = () => {
  active = createAccount()
  wallets.push(active)
  renderWallets()
  renderActions()
}
$('reset').onclick = () => {
  wallets.length = 0
  active = null
  renderWallets()
  renderActions()
  say('Temporary wallets removed from this tab.')
}
renderRecord()
async function initialize() {
  try {
    const response = await fetch(new URL('deployment.json', document.baseURI))
    if (!response.ok) throw new Error('Deployment unavailable')
    deployment = await response.json()
    if (!isAddress(deployment.address)) throw new Error('Invalid deployment')
    const evidenceResponse = await fetch(new URL('evidence.json', document.baseURI), {cache:'no-cache'})
    if (evidenceResponse.ok && evidenceResponse.headers.get('content-type')?.includes('json')) evidence = await evidenceResponse.json()
    $('contract-link').href = explorer + '/address/' + deployment.address
    $('contract-link').hidden = false
    route()
  } catch {
    $('read-status').textContent = 'The Studionet deployment is currently unavailable.'
  }
}
initialize()
