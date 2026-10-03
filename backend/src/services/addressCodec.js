import { computeAddress, getAddress, isAddress } from 'ethers';
import { createBase58check, base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import * as btc from '@scure/btc-signer';
import { bytesToHex } from '@noble/hashes/utils.js';
import { config } from '../config/index.js';

const b58c = createBase58check(sha256);
export const btcNet = () => (config.btcNetwork === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK);

const evmFromPub = (pub) => computeAddress('0x' + bytesToHex(pub));

/** Public key → address for each network. */
export function encodeAddress(networkId, pubKey) {
  switch (networkId) {
    case 'ETH':
    case 'BSC':
      return evmFromPub(pubKey);
    case 'TRON': {
      const evm = evmFromPub(pubKey).slice(2);
      const bytes = new Uint8Array(21);
      bytes[0] = 0x41;
      bytes.set(Buffer.from(evm, 'hex'), 1);
      return b58c.encode(bytes);
    }
    case 'BTC':
      return btc.p2wpkh(pubKey, btcNet()).address;
    case 'SOL':
      return base58.encode(pubKey);
    default:
      throw new Error(`No encoder for ${networkId}`);
  }
}

/** Validate a user-supplied address for a network. */
export function isValidAddress(networkId, address) {
  try {
    switch (networkId) {
      case 'ETH':
      case 'BSC':
        return isAddress(address);
      case 'TRON': {
        const b = b58c.decode(address);
        return b.length === 21 && b[0] === 0x41;
      }
      case 'BTC':
        btc.Address(btcNet()).decode(address);
        return true;
      case 'SOL':
        return base58.decode(address).length === 32;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Canonical form used for DB lookups (EVM checksummed, others as-is). */
export function normalizeAddress(networkId, address) {
  if (networkId === 'ETH' || networkId === 'BSC') return getAddress(address);
  return address.trim();
}

/** TRON base58 → 0x hex (for ABI encoding / TronGrid calls) */
export const tronToHex = (a) => '0x' + Buffer.from(b58c.decode(a).slice(1)).toString('hex');
export const hexToTron = (hex) => {
  const bytes = new Uint8Array(21);
  bytes[0] = 0x41;
  bytes.set(Buffer.from(hex.replace(/^0x/, '').slice(-40), 'hex'), 1);
  return b58c.encode(bytes);
};
