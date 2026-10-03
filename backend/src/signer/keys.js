/**
 * ─── SIGNER BOUNDARY ────────────────────────────────────────────────────────
 * Everything in /signer touches the master mnemonic / private keys.
 * In this MVP it runs in-process for convenience. In production move this
 * folder into its own service (no inbound internet, mTLS, HSM/KMS-wrapped seed)
 * and expose only: getAccountXpubs(), solanaAddress(i), hotAddress(net), sign*(...).
 * The API/listeners only ever need xpubs (watch-only).
 * ──────────────────────────────────────────────────────────────────────────
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { config } from '../config/index.js';
import { NETWORKS } from '../config/chains.js';
import { encodeAddress } from '../services/addressCodec.js';

let seedCache;
function seed() {
  if (!seedCache) {
    if (!validateMnemonic(config.mnemonic, wordlist)) throw new Error('MASTER_MNEMONIC is not a valid BIP39 phrase');
    seedCache = mnemonicToSeedSync(config.mnemonic);
  }
  return seedCache;
}
const master = () => HDKey.fromMasterSeed(seed());

/** Account-level path (hardened). Deposit = account 0, Hot wallet = account 1. */
export function accountPath(networkId, account = 0) {
  const n = NETWORKS[networkId];
  const purpose = networkId === 'BTC' ? 84 : 44; // BIP84 native segwit for BTC
  return `m/${purpose}'/${n.coinType}'/${account}'`;
}

/** xpubs for watch-only derivation of deposit addresses (secp256k1 networks only). */
export function getAccountXpubs() {
  const out = {};
  for (const id of Object.keys(NETWORKS)) {
    if (NETWORKS[id].curve !== 'secp256k1') continue;
    out[id] = master().derive(accountPath(id, 0)).publicExtendedKey;
  }
  return out;
}

// ── SLIP-0010 ed25519 (Solana) — only hardened derivation exists, so no xpub ──
function slip10Ed25519(path) {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed());
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const seg of path.replace(/^m\//, '').split('/')) {
    const idx = (parseInt(seg, 10) | 0x80000000) >>> 0;
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, idx);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key; // 32-byte ed25519 private seed
}

/** Solana deposit paths follow Phantom-style m/44'/501'/{i}'/0'; index 0 is reserved for the hot wallet. */
export const solanaPath = (index) => `m/44'/501'/${index}'/0'`;

export function solanaAddress(index) {
  const pub = ed25519.getPublicKey(slip10Ed25519(solanaPath(index)));
  return encodeAddress('SOL', pub);
}

/** Hot wallet / gas station per network. */
export function hotWallet(networkId) {
  if (networkId === 'SOL') return { address: solanaAddress(0), path: solanaPath(0) };
  const path = `${accountPath(networkId, 1)}/0/0`;
  const key = master().derive(path);
  return { address: encodeAddress(networkId, key.publicKey), path };
}

/** Private key for a path — used by live adapters when signing. Never leaves the signer. */
export function privateKeyFor(networkId, path) {
  if (networkId === 'SOL') return slip10Ed25519(path);
  return master().derive(path).privateKey;
}
