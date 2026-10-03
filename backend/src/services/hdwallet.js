/**
 * Watch-only address derivation. Uses account xpubs for secp256k1 chains
 * (no private key needed) and asks the signer for Solana (ed25519 is hardened-only).
 */
import { HDKey } from '@scure/bip32';
import { NETWORKS } from '../config/chains.js';
import { encodeAddress } from './addressCodec.js';
import * as signer from '../signer/keys.js';

let xpubs;
const getXpubs = () => (xpubs ??= signer.getAccountXpubs());

export function deriveDepositAddress(networkId, index) {
  if (NETWORKS[networkId].curve === 'ed25519') {
    // index 0 is the hot wallet → clients start at 1
    return { address: signer.solanaAddress(index + 1), path: signer.solanaPath(index + 1) };
  }
  const account = HDKey.fromExtendedKey(getXpubs()[networkId]);
  const child = account.deriveChild(0).deriveChild(index); // external chain /0/i
  return {
    address: encodeAddress(networkId, child.publicKey),
    path: `${signer.accountPath(networkId, 0)}/0/${index}`,
  };
}

export const hotWalletAddress = (networkId) => signer.hotWallet(networkId);
