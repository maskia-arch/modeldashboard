/**
 * Interactive helper script to generate GramJS MTProto TELEGRAM_SESSION_STRING.
 * Run via: npm run telegram:login
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log("==================================================");
  console.log("  Telegram MTProto Session String Generator       ");
  console.log("==================================================");
  console.log("You will need API ID and API HASH from https://my.telegram.org/apps\n");

  const envApiId = process.env.TELEGRAM_API_ID;
  const envApiHash = process.env.TELEGRAM_API_HASH;

  const apiIdStr = envApiId && envApiId !== "123456" ? envApiId : await question("Enter your Telegram API_ID: ");
  const apiHash = envApiHash && envApiHash !== "demo_hash" ? envApiHash : await question("Enter your Telegram API_HASH: ");

  const apiId = parseInt(apiIdStr.trim(), 10);
  const stringSession = new StringSession("");

  console.log("\nConnecting to Telegram...");
  const client = new TelegramClient(stringSession, apiId, apiHash.trim(), {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question("Enter your Telegram Phone Number (+1234...): "),
    password: async () => await question("Enter your 2FA Password (if any, or press Enter): "),
    phoneCode: async () => await question("Enter the Verification Code sent to Telegram: "),
    onError: (err) => console.error("Login Error:", err),
  });

  console.log("\n✅ Login successful!");
  const session = client.session.save() as unknown as string;

  console.log("\n================ YOUR SESSION STRING ================");
  console.log(session);
  console.log("=====================================================");
  console.log("\nCopy this string and set it in your .env file as:");
  console.log(`TELEGRAM_SESSION_STRING="${session}"\n`);

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Session generation failed:", err);
  rl.close();
  process.exit(1);
});
