/**
 * Mock blockchain simulator.
 *  - Block height per network lives in Redis and is advanced by the worker's block ticker.
 *  - Transfers live in Mongo (MockChainTx) and count as mined once height >= blockNumber.
 *  - Balances are derived from the ledger, fees are charged in the network's native coin.
 */
import crypto from 'node:crypto';
import { Wallet } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base58 } from '@scure/base';
import { MockChainTx } from '../../models/index.js';
import { redis } from '../../lib/redis.js';
import { NETWORKS, ASSETS, nativeAssetOf } from '../../config/chains.js';
import { toRaw, fromRaw } from '../../lib/money.js';
import { encodeAddress } from '../../services/addressCodec.js';

const START_HEIGHTS = { TRON: 61_200_000, ETH: 7_150_000, BSC: 47_800_000, BTC: 3_890_000, SOL: 412_000_000 };
const hKey = (n) => `mock:height:${n}`;

export async function getHeight(networkId) {
  const v = await redis().get(hKey(networkId));
  if (v) return Number(v);
  await redis().set(hKey(networkId), START_HEIGHTS[networkId], 'NX');
  return Number(await redis().get(hKey(networkId)));
}

export async function mine(networkId, blocks = 1) {
  await getHeight(networkId);
  return redis().incrby(hKey(networkId), blocks);
}

export function randomTxHash(networkId) {
  if (networkId === 'SOL') return base58.encode(crypto.randomBytes(64));
  const hex = crypto.randomBytes(32).toString('hex');
  return networkId === 'ETH' || networkId === 'BSC' ? `0x${hex}` : hex;
}

export function randomExternalAddress(networkId) {
  if (networkId === 'SOL') return base58.encode(crypto.randomBytes(32));
  if (networkId === 'ETH' || networkId === 'BSC') return Wallet.createRandom().address;
  const pub = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true);
  return encodeAddress(networkId, pub);
}

async function sumRaw(match) {
  const [r] = await MockChainTx.aggregate([
    { $match: match },
    { $group: { _id: null, amt: { $sum: { $toDecimal: '$amountRaw' } }, fee: { $sum: { $toDecimal: '$feeRaw' } } } },
  ]);
  return { amt: BigInt(r ? r.amt.toString().split('.')[0] : 0), fee: BigInt(r ? r.fee.toString().split('.')[0] : 0) };
}

/** Spendable balance in base units: mined inbound − all outbound (incl. pending) − fees paid. */
export async function balanceRaw(networkId, address, assetCode) {
  const height = await getHeight(networkId);
  const inbound = await sumRaw({ network: networkId, to: address, asset: assetCode, blockNumber: { $lte: height } });
  const outbound = await sumRaw({ network: networkId, from: address, asset: assetCode });
  let bal = inbound.amt - outbound.amt;
  if (nativeAssetOf(networkId).code === assetCode) {
    const fees = await sumRaw({ network: networkId, from: address });
    bal -= fees.fee;
  }
  return bal;
}

/** Fee (native, base units) for a transfer of `assetCode`. */
export function feeFor(networkId, assetCode) {
  const net = NETWORKS[networkId];
  const native = nativeAssetOf(networkId);
  const fee = ASSETS[assetCode].type === 'token' ? net.gasPerTokenTransfer : net.nativeTransferFee;
  return BigInt(toRaw(fee, native.decimals));
}

/**
 * Insert a transfer into the next block. `inputs` lets UTXO chains spend from many
 * addresses in one tx (one ledger row per input, same txHash).
 */
export async function createTransfer({ networkId, assetCode, inputs, to, chargeFee = true, memo }) {
  const height = await getHeight(networkId);
  const txHash = randomTxHash(networkId);
  const asset = ASSETS[assetCode];
  const fee = chargeFee ? feeFor(networkId, assetCode) : 0n;
  const docs = inputs.map((inp, i) => ({
    network: networkId, txHash, asset: assetCode,
    from: inp.address, to, amountRaw: String(inp.amountRaw), amount: fromRaw(inp.amountRaw, asset.decimals),
    feeRaw: i === 0 ? String(fee) : '0', blockNumber: height + 1, outputIndex: i, memo,
  }));
  await MockChainTx.insertMany(docs);
  return { txHash, blockNumber: height + 1, feeRaw: fee };
}

export async function getTx(txHash) {
  return MockChainTx.findOne({ txHash }).lean();
}
