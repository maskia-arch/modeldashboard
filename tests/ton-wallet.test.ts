import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { isValidTonAddress } from "../src/lib/ton";

async function main() {
  console.log("=== Testing Client-Side TON Wallet Generation ===");

  // 1. Generate 24 mnemonic words
  const words = await mnemonicNew(24);
  console.log(`✓ Generated ${words.length}-word mnemonic`);

  // 2. Derive keypair
  const keyPair = await mnemonicToPrivateKey(words);
  console.log("✓ Derived public/secret keypair from mnemonic");

  // 3. Create V4R2 contract address
  const workchain = 0;
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const address = wallet.address.toString({ testOnly: false, bounceable: false });
  console.log(`✓ Derived V4R2 TON Address: ${address}`);

  // 4. Validate Address format
  const isValid = isValidTonAddress(address);
  if (!isValid) {
    throw new Error(`Address validation failed for ${address}`);
  }
  console.log("✓ Address format validated successfully against TON regex!");

  console.log("\n✨ All TON Wallet Generation tests PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
