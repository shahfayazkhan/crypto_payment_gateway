/**
 * Seeds a realistic mock dataset:
 *  - admin + finance users, 8 clients with mock MT5 accounts
 *  - HD deposit addresses for every client on every network
 *  - funded hot wallets (mock faucet)
 *  - 14 days of history: credited deposits (some swept), withdrawals in every state, sweeps
 *  - consistent mock-chain ledger so balances, sweeps and treasury numbers all add up
 *
 * Usage: npm run seed            (wipes gateway collections + Redis keys first)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import {
  User, Counter, WalletAddress, Deposit, Withdrawal, Sweep, Mt5Account, Mt5Deal, MockChainTx, AuditLog, WebhookDelivery,
} from '../models/index.js';
import { ASSETS, NETWORKS, NETWORK_IDS, DEPOSIT_ASSETS } from '../config/chains.js';
import { ensureClientWallets, ensureTreasuryWallets, getTreasuryAddresses } from '../services/wallet.service.js';
import { fundHotWallets } from '../services/simulator.service.js';
import * as chain from '../chains/mock/mockChain.js';
import { toRaw, round } from '../lib/money.js';

const PASSWORD = 'Passw0rd!';
const PRICES = { USDT: 1, BTC: 64250, SOL: 152.4 };
const CLIENTS = [
  ['Omar Haddad', 'AE'], ['Lina Petrova', 'CY'], ['Daniel Mensah', 'GH'], ['Aisha Rahman', 'PK'],
  ['Marco Bianchi', 'IT'], ['Sara Lindqvist', 'SE'], ['Yusuf Demir', 'TR'], ['Priya Nair', 'IN'],
];
const AMOUNTS = { USDT_TRC20: [50, 4000], USDT_ERC20: [200, 9000], USDT_BEP20: [30, 3000], BTC: [0.002, 0.12], SOL: [1, 60] };

let seedState = 42;
const rand = () => ((seedState = (seedState * 16807) % 2147483647) / 2147483647); // deterministic
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = ([a, b]) => Number((a + rand() * (b - a)).toPrecision(4));
const priceOf = (code) => PRICES[ASSETS[code].priceKey] * (1 + (rand() - 0.5) * 0.04);

async function wipe() {
  const models = [User, Counter, WalletAddress, Deposit, Withdrawal, Sweep, Mt5Account, Mt5Deal, MockChainTx, AuditLog, WebhookDelivery];
  for (const m of models) await m.deleteMany({});
  const keys = await redis().keys('*');
  const ours = keys.filter((k) => /^(mock:|listener:|addrver:|prices:|lock:|dev:)/.test(k));
  if (ours.length) await redis().del(...ours);
  for (const m of models) await m.syncIndexes();
}

/** Insert bypassing timestamps so we can back-date history. */
async function insertBackdated(Model, docs) {
  if (!docs.length) return;
  await Model.collection.insertMany(docs.map((d) => {
    const o = new Model(d).toObject();
    o.createdAt = d.createdAt; o.updatedAt = d.updatedAt || d.createdAt;
    return o;
  }));
}

async function main() {
  await connectDb();
  console.log('› wiping gateway data');
  await wipe();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await User.create([
    { email: 'admin@gateway.test', name: 'Gateway Admin', role: 'admin', passwordHash },
    { email: 'finance@gateway.test', name: 'Finance Desk', role: 'finance', passwordHash },
  ]);

  console.log('› clients + MT5 accounts + HD addresses');
  const clients = [];
  for (const [i, [name, country]] of CLIENTS.entries()) {
    const login = 5100100 + i * 7;
    const email = i === 0 ? 'client@gateway.test' : `${name.split(' ')[0].toLowerCase()}@gateway.test`;
    const u = await User.create({ email, name, role: 'client', passwordHash, mt5Login: login, country });
    await Mt5Account.create({ login, name, balance: round(500 + rand() * 4000), margin: round(rand() * 300), leverage: pick([100, 200, 500]) });
    await ensureClientWallets(u._id);
    clients.push(u);
  }

  await ensureTreasuryWallets();
  // establish heights, then fund hot wallets "a while ago"
  const heights = {};
  for (const n of NETWORK_IDS) heights[n] = await chain.getHeight(n);
  await fundHotWallets();
  await MockChainTx.updateMany({ memo: 'faucet' }, [{ $set: { blockNumber: { $subtract: ['$blockNumber', 400000] } } }], { updatePipeline: true });

  const blockAt = (network, date) => heights[network] - Math.ceil((Date.now() - date.getTime()) / NETWORKS[network].mockBlockMs) - 1;
  const deposits = []; const txs = []; const deals = []; const withdrawals = []; const sweeps = [];
  const mt5Delta = {};

  console.log('› 14 days of deposits');
  for (let i = 0; i < 130; i++) {
    const u = pick(clients);
    const asset = pick(DEPOSIT_ASSETS);
    const amount = between(AMOUNTS[asset.code]);
    const createdAt = new Date(Date.now() - rand() * 14 * 864e5 - 3600e3);
    const addr = await WalletAddress.findOne({ user: u._id, network: asset.network, kind: 'deposit' }).lean();
    const txHash = chain.randomTxHash(asset.network);
    const blockNumber = blockAt(asset.network, createdAt);
    const price = priceOf(asset.code);
    const usd = round(amount * price);
    const failed = i === 7; // one credit failure to demo "retry credit"
    const dealId = failed ? undefined : String(800000000 + i);
    txs.push({ network: asset.network, txHash, asset: asset.code, from: chain.randomExternalAddress(asset.network), to: addr.address, amountRaw: toRaw(amount, asset.decimals), amount, blockNumber, memo: 'seed', createdAt });
    deposits.push({
      _id: new mongoose.Types.ObjectId(), user: u._id, mt5Login: u.mt5Login, network: asset.network, asset: asset.code, address: addr.address,
      fromAddress: txs.at(-1).from, txHash, outputIndex: 0, blockNumber, amount, amountRaw: toRaw(amount, asset.decimals),
      confirmations: NETWORKS[asset.network].confirmations, requiredConfirmations: NETWORKS[asset.network].confirmations,
      status: failed ? 'credit_failed' : 'credited', error: failed ? 'MT5 bridge timeout (seeded example)' : undefined,
      priceUsd: round(price, 4), amountUsd: usd, mt5DealId: dealId,
      creditedAt: failed ? undefined : new Date(createdAt.getTime() + 90e3), createdAt,
    });
    if (!failed) {
      deals.push({ dealId, login: u.mt5Login, type: 'deposit', amount: usd, comment: `CRYPTO DEP ${asset.symbol}`, idempotencyKey: `dep:${deposits.at(-1)._id}`, createdAt });
      mt5Delta[u.mt5Login] = (mt5Delta[u.mt5Login] || 0) + usd;
    }
  }
  // one below-minimum deposit
  {
    const u = clients[2]; const asset = ASSETS.USDT_TRC20;
    const addr = await WalletAddress.findOne({ user: u._id, network: 'TRON' }).lean();
    const createdAt = new Date(Date.now() - 2 * 864e5);
    const txHash = chain.randomTxHash('TRON');
    txs.push({ network: 'TRON', txHash, asset: asset.code, from: chain.randomExternalAddress('TRON'), to: addr.address, amountRaw: toRaw(3, 6), amount: 3, blockNumber: blockAt('TRON', createdAt), memo: 'seed', createdAt });
    deposits.push({ user: u._id, mt5Login: u.mt5Login, network: 'TRON', asset: asset.code, address: addr.address, fromAddress: txs.at(-1).from, txHash, blockNumber: txs.at(-1).blockNumber, amount: 3, amountRaw: toRaw(3, 6), confirmations: 19, requiredConfirmations: 19, status: 'below_minimum', priceUsd: 1, amountUsd: 3, createdAt });
  }

  console.log('› historical sweeps (older deposits)');
  const sweepCutoff = Date.now() - 2 * 864e5; // deposits older than 2 days were swept
  for (const asset of DEPOSIT_ASSETS) {
    const { hot, cold } = await getTreasuryAddresses(asset.network);
    const old = deposits.filter((d) => d.asset === asset.code && d.status === 'credited' && d.createdAt.getTime() < sweepCutoff);
    const byAddr = Object.groupBy(old, (d) => d.address);
    for (const [address, list] of Object.entries(byAddr)) {
      const total = list.reduce((a, d) => a + d.amount, 0);
      const createdAt = new Date(Math.max(...list.map((d) => d.createdAt.getTime())) + 6 * 3600e3);
      const toCold = rand() < 0.6;
      const sweepId = new mongoose.Types.ObjectId();
      const txHash = chain.randomTxHash(asset.network);
      const net = NETWORKS[asset.network];
      const feeAsset = asset.type === 'token' ? net.native : asset.code;
      const fee = asset.type === 'token' ? net.gasPerTokenTransfer : net.nativeTransferFee;
      const sweptAmt = asset.type === 'native' ? total - fee : total;
      if (asset.type === 'token') {
        // gas top-up from hot wallet first
        txs.push({ network: asset.network, txHash: chain.randomTxHash(asset.network), asset: feeAsset, from: hot.address, to: address, amountRaw: toRaw(fee, ASSETS[feeAsset].decimals), amount: fee, feeRaw: toRaw(net.nativeTransferFee, ASSETS[feeAsset].decimals), blockNumber: blockAt(asset.network, createdAt) - 5, memo: 'seed-gas', createdAt });
      }
      txs.push({ network: asset.network, txHash, asset: asset.code, from: address, to: toCold ? cold.address : hot.address, amountRaw: toRaw(sweptAmt, asset.decimals), amount: sweptAmt, feeRaw: toRaw(fee, ASSETS[feeAsset].decimals), blockNumber: blockAt(asset.network, createdAt), memo: 'seed-sweep', createdAt });
      sweeps.push({ _id: sweepId, network: asset.network, asset: asset.code, fromAddresses: [address], toAddress: toCold ? cold.address : hot.address, destination: toCold ? 'cold' : 'hot', amount: round(sweptAmt, 8), amountUsd: round(sweptAmt * priceOf(asset.code)), txHash, gasTopupAmount: asset.type === 'token' ? fee : undefined, confirmations: net.confirmations, status: 'completed', deposits: list.map((d) => d._id), completedAt: new Date(createdAt.getTime() + 600e3), trigger: 'schedule', createdAt });
      for (const d of list) { d.sweep = sweepId; d.sweptAt = new Date(createdAt.getTime() + 600e3); }
    }
  }

  console.log('› withdrawals');
  const wdStates = [...Array(18).fill('completed'), 'pending_review', 'pending_review', 'pending_review', 'rejected', 'rejected', 'cancelled', 'broadcast'];
  for (const [i, status] of wdStates.entries()) {
    const u = pick(clients);
    const asset = pick(DEPOSIT_ASSETS);
    const amount = Math.max(asset.minWithdrawal * 2, Number((between(AMOUNTS[asset.code]) / 2).toPrecision(4)));
    const createdAt = status === 'pending_review' ? new Date(Date.now() - rand() * 3 * 3600e3)
      : status === 'broadcast' ? new Date(Date.now() - 60e3) : new Date(Date.now() - rand() * 13 * 864e5 - 864e5);
    const price = priceOf(asset.code);
    const usd = round(amount * price);
    const { hot } = await getTreasuryAddresses(asset.network);
    const net = round(amount - asset.withdrawalFee, 8);
    const toAddress = chain.randomExternalAddress(asset.network);
    const doc = {
      _id: new mongoose.Types.ObjectId(), user: u._id, mt5Login: u.mt5Login, network: asset.network, asset: asset.code, toAddress,
      amount, fee: asset.withdrawalFee, netAmount: net, priceUsd: round(price, 4), amountUsd: usd, status,
      requiredConfirmations: NETWORKS[asset.network].confirmations, mt5DebitDealId: String(900000000 + i), createdAt,
    };
    deals.push({ dealId: doc.mt5DebitDealId, login: u.mt5Login, type: 'withdrawal', amount: usd, comment: `CRYPTO WD ${asset.symbol}`, idempotencyKey: `wd:${doc._id}`, createdAt });
    mt5Delta[u.mt5Login] = (mt5Delta[u.mt5Login] || 0) - usd;
    if (status === 'rejected' || status === 'cancelled') {
      doc.mt5RefundDealId = String(910000000 + i);
      doc.reviewNote = status === 'rejected' ? pick(['Address flagged by screening', 'Third-party wallet — KYC mismatch']) : undefined;
      doc.reviewedAt = new Date(createdAt.getTime() + 1800e3);
      deals.push({ dealId: doc.mt5RefundDealId, login: u.mt5Login, type: 'deposit', amount: usd, comment: 'CRYPTO WD REFUND', idempotencyKey: `wd-refund:${doc._id}`, createdAt: doc.reviewedAt });
      mt5Delta[u.mt5Login] += usd;
    }
    if (status === 'completed' || status === 'broadcast') {
      const n = NETWORKS[asset.network];
      const feeAsset = asset.type === 'token' ? n.native : asset.code;
      const fee = asset.type === 'token' ? n.gasPerTokenTransfer : n.nativeTransferFee;
      doc.txHash = chain.randomTxHash(asset.network);
      doc.fromAddress = hot.address;
      doc.blockNumber = status === 'broadcast' ? heights[asset.network] - 1 : blockAt(asset.network, new Date(createdAt.getTime() + 3600e3));
      doc.confirmations = status === 'broadcast' ? 1 : n.confirmations;
      if (status === 'completed') doc.completedAt = new Date(createdAt.getTime() + 4000e3);
      doc.reviewedAt = new Date(createdAt.getTime() + 1200e3);
      txs.push({ network: asset.network, txHash: doc.txHash, asset: asset.code, from: hot.address, to: toAddress, amountRaw: toRaw(net, asset.decimals), amount: net, feeRaw: toRaw(fee, ASSETS[feeAsset].decimals), blockNumber: doc.blockNumber, memo: 'seed-withdrawal', createdAt });
    }
    withdrawals.push(doc);
  }

  await insertBackdated(MockChainTx, txs);
  await insertBackdated(Deposit, deposits);
  await insertBackdated(Sweep, sweeps);
  await insertBackdated(Withdrawal, withdrawals);
  await insertBackdated(Mt5Deal, deals);
  for (const [login, delta] of Object.entries(mt5Delta)) {
    await Mt5Account.updateOne({ login: Number(login) }, [{ $set: { balance: { $round: [{ $max: [0, { $add: ['$balance', delta] }] }, 2] } } }], { updatePipeline: true });
  }

  // listeners start from "now" — history is already recorded
  for (const n of NETWORK_IDS) await redis().set(`listener:cursor:${n}`, heights[n]);

  console.log('\n✔ seed complete');
  console.log(`  deposits ${deposits.length} · withdrawals ${withdrawals.length} · sweeps ${sweeps.length} · ledger txs ${txs.length}`);
  console.log(`\n  Logins (password: ${PASSWORD})`);
  console.log('   admin@gateway.test    — admin');
  console.log('   finance@gateway.test  — finance');
  console.log('   client@gateway.test   — client (Omar Haddad, MT5 5100100)');
  await mongoose.disconnect();
  redis().disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
