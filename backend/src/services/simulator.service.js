/** Mock-mode helpers used by /api/dev and the traffic generator. */
import { WalletAddress, User, MockChainTx } from '../models/index.js';
import { ASSETS, NETWORK_IDS, nativeAssetOf } from '../config/chains.js';
import { config } from '../config/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { toRaw } from '../lib/money.js';
import * as chain from '../chains/mock/mockChain.js';
import { ensureClientWallets, getTreasuryAddresses } from './wallet.service.js';

export function assertMock() {
  if (config.chainMode !== 'mock') throw badRequest('Simulator is only available when CHAIN_MODE=mock');
}

/** Send `amount` of `asset` from a random external wallet to a client's deposit address. */
export async function simulateDeposit({ userId, mt5Login, address, asset: assetCode, amount }) {
  assertMock();
  const asset = ASSETS[assetCode];
  if (!asset?.depositable) throw badRequest('Unsupported asset');
  let to = address;
  if (!to) {
    const user = userId ? await User.findById(userId) : await User.findOne({ mt5Login });
    if (!user) throw notFound('Client not found');
    const wallets = await ensureClientWallets(user._id);
    to = wallets.find((w) => w.network === asset.network)?.address;
  } else if (!(await WalletAddress.exists({ network: asset.network, address: to }))) {
    throw badRequest('Address is not a gateway deposit address on that network');
  }
  const from = chain.randomExternalAddress(asset.network);
  const tx = await chain.createTransfer({
    networkId: asset.network, assetCode, inputs: [{ address: from, amountRaw: toRaw(amount, asset.decimals) }], to, chargeFee: false, memo: 'simulated',
  });
  return { ...tx, network: asset.network, asset: assetCode, amount, from, to, feeRaw: undefined };
}

/** Fund treasury hot wallets (incl. gas coins) from a faucet. */
export async function fundHotWallets(amounts = {}) {
  assertMock();
  const defaults = { USDT_TRC20: 20000, USDT_ERC20: 15000, USDT_BEP20: 15000, BTC: 0.6, SOL: 150, TRX: 50000, ETH: 3, BNB: 20 };
  const out = [];
  for (const network of NETWORK_IDS) {
    const { hot } = await getTreasuryAddresses(network);
    for (const a of Object.values(ASSETS).filter((x) => x.network === network)) {
      const amt = amounts[a.code] ?? defaults[a.code];
      if (!amt) continue;
      await chain.createTransfer({ networkId: network, assetCode: a.code, inputs: [{ address: `FAUCET-${network}`, amountRaw: toRaw(amt, a.decimals) }], to: hot.address, chargeFee: false, memo: 'faucet' });
      out.push({ network, asset: a.code, amount: amt, to: hot.address });
    }
  }
  return out;
}

export async function chainState() {
  const out = [];
  for (const n of NETWORK_IDS) {
    out.push({
      network: n, height: await chain.getHeight(n), native: nativeAssetOf(n).code,
      recent: await MockChainTx.find({ network: n }).sort({ createdAt: -1 }).limit(10).lean(),
    });
  }
  return out;
}
