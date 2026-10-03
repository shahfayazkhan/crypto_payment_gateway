import { User, WalletAddress, nextSeq } from '../models/index.js';
import { NETWORK_IDS } from '../config/chains.js';
import { config } from '../config/index.js';
import { deriveDepositAddress, hotWalletAddress } from './hdwallet.js';
import { redis } from '../lib/redis.js';

export const addrVersionKey = (n) => `addrver:${n}`;

/** Ensure the client has a derivation index and one deposit address per network. Idempotent. */
export async function ensureClientWallets(userId) {
  let user = await User.findById(userId);
  if (user.derivationIndex === undefined || user.derivationIndex === null) {
    const idx = (await nextSeq('hd:deposit')) - 1;
    user = await User.findOneAndUpdate(
      { _id: userId, derivationIndex: { $exists: false } }, { derivationIndex: idx }, { returnDocument: 'after' },
    ) || await User.findById(userId);
  }
  const existing = await WalletAddress.find({ user: user._id, kind: 'deposit' }).lean();
  const have = new Set(existing.map((w) => w.network));
  for (const network of NETWORK_IDS) {
    if (have.has(network)) continue;
    const { address, path } = deriveDepositAddress(network, user.derivationIndex);
    // ETH & BSC share an address (same key) — they're separate rows because they're separate chains
    await WalletAddress.updateOne(
      { network, address },
      { $setOnInsert: { network, address, kind: 'deposit', user: user._id, derivationPath: path, derivationIndex: user.derivationIndex } },
      { upsert: true },
    );
    await redis().incr(addrVersionKey(network));
  }
  return WalletAddress.find({ user: user._id, kind: 'deposit' }).sort({ network: 1 }).lean();
}

/** Register hot + cold wallets so listeners and the treasury view know about them. */
export async function ensureTreasuryWallets() {
  for (const network of NETWORK_IDS) {
    const hot = hotWalletAddress(network);
    await WalletAddress.updateOne({ network, address: hot.address },
      { $setOnInsert: { network, address: hot.address, kind: 'hot', derivationPath: hot.path, label: `${network} hot wallet` } }, { upsert: true });
    const cold = config.coldWallets[network];
    if (cold) {
      await WalletAddress.updateOne({ network, address: cold },
        { $setOnInsert: { network, address: cold, kind: 'cold', label: `${network} cold wallet (watch-only)` } }, { upsert: true });
    }
  }
}

export async function getTreasuryAddresses(network) {
  const rows = await WalletAddress.find({ network, kind: { $in: ['hot', 'cold'] } }).lean();
  return { hot: rows.find((r) => r.kind === 'hot'), cold: rows.find((r) => r.kind === 'cold') };
}
