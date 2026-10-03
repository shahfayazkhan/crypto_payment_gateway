// Prints the first deposit addresses + hot wallets for each network (sanity check).
import { NETWORK_IDS } from '../config/chains.js';
import { deriveDepositAddress, hotWalletAddress } from '../services/hdwallet.js';
import { isValidAddress } from '../services/addressCodec.js';

for (const n of NETWORK_IDS) {
  const hot = hotWalletAddress(n);
  console.log(`\n${n}  hot: ${hot.address}  (${hot.path})  valid=${isValidAddress(n, hot.address)}`);
  for (let i = 0; i < 3; i++) {
    const d = deriveDepositAddress(n, i);
    console.log(`  #${i} ${d.address}  ${d.path}  valid=${isValidAddress(n, d.address)}`);
  }
}
