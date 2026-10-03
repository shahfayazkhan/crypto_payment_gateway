import { config } from '../config/index.js';
import { consume, QUEUES, connectRabbit } from '../lib/rabbit.js';
import { creditDeposit } from '../services/deposit.service.js';
import { processWithdrawal } from '../services/withdrawal.service.js';
import { runSweepCycle, advanceSweeps } from '../services/sweep.service.js';
import { deliver } from '../services/webhook.service.js';
import { refreshPrices } from '../services/price.service.js';
import { ensureTreasuryWallets } from '../services/wallet.service.js';
import { startListeners } from './listener.js';
import { startMockChainTicker } from './mockChainTicker.js';
import { startMockTraffic } from './mockTraffic.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('workers');

export async function startWorkers() {
  await connectRabbit();
  await ensureTreasuryWallets();

  await consume(QUEUES.DEPOSIT_CONFIRMED, ({ depositId }) => creditDeposit(depositId));
  await consume(QUEUES.WITHDRAWAL_APPROVED, ({ withdrawalId }) => processWithdrawal(withdrawalId), { prefetch: 1 });
  await consume(QUEUES.SWEEP_RUN, (msg) => runSweepCycle({ trigger: 'manual', force: !!msg.force }), { prefetch: 1 });
  await consume(QUEUES.WEBHOOK_OUT, ({ deliveryId }) => deliver(deliveryId), { prefetch: 10 });

  if (config.chainMode === 'mock') {
    startMockChainTicker();
    await startMockTraffic();
  }
  startListeners();

  await refreshPrices().catch(() => {});
  setInterval(() => refreshPrices().catch((e) => log.error('price refresh', { e: e.message })), 5000);
  setInterval(() => runSweepCycle({ trigger: 'schedule' }).catch((e) => log.error('sweep cycle', { e: e.message })), config.treasury.sweepIntervalMs);
  setInterval(() => advanceSweeps().catch((e) => log.error('sweep advance', { e: e.message })), 3000);

  log.info(`all workers running (chain=${config.chainMode}, mt5=${config.mt5Mode})`);
}
