import {createClient} from 'genlayer-js'
import {studionet} from 'genlayer-js/chains'
import {TransactionStatus} from 'genlayer-js/types'

export const chain = studionet
export const client = createClient({chain})
export const explorer = 'https://explorer-studio.genlayer.com'
export const finalized = hash => client.waitForTransactionReceipt({
  hash, status: TransactionStatus.FINALIZED, retries: 180, interval: 3000,
})
export function outcome(receipt, hash) {
  const vote = receipt.consensus_data?.leader_receipt?.[0]
  const execution = receipt.txExecutionResultName ?? vote?.execution_result
  return {
    hash,
    status: receipt.status === TransactionStatus.FINALIZED ? 'FINALIZED' : (receipt.statusName ?? receipt.status),
    execution: execution === 'FINISHED_WITH_RETURN' ? 'SUCCESS' : execution,
    reason: vote?.result?.payload?.readable ?? vote?.error ?? null,
  }
}
