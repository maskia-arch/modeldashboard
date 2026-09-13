import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import qrcodeTerminal from "qrcode-terminal";
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

  const envApiId = process.env.TELEGRAM_API_ID;
  const envApiHash = process.env.TELEGRAM_API_HASH;

  const apiIdStr = envApiId && envApiId !== "123456" ? envApiId : await question("Enter your Telegram API_ID: ");
  const apiHash = envApiHash && envApiHash !== "demo_hash" ? envApiHash : await question("Enter your Telegram API_HASH: ");

  const apiId = parseInt(apiIdStr.trim(), 10);
  const stringSession = new StringSession("");

  console.log("\nConnecting to Telegram Network...");
  const client = new TelegramClient(stringSession, apiId, apiHash.trim(), {
    connectionRetries: 5,
  });

  await client.connect();

  console.log("\n================ LOGIN METHOD ================");
  console.log("1) QR-Code scannen mit der Telegram-App (EMPFOHLEN - Kein SMS-Zugriff nötig!)");
  console.log("2) Telefonnummer & SMS/In-App Code");
  console.log("==============================================");
  const choice = (await question("Wähle Methode (1 oder 2, Standard = 1): ")).trim();

  if (choice === "2") {
    // Phone / SMS Flow
    const phoneNumber = (await question("\nEnter your Telegram Phone Number (+49...): ")).trim();
    console.log(`\nRequesting verification code from Telegram for ${phoneNumber}...`);
    
    let sendCodeResult;
    try {
      sendCodeResult = await client.sendCode(
        {
          apiId,
          apiHash: apiHash.trim(),
        },
        phoneNumber
      );
    } catch (err: any) {
      if (err.errorMessage && err.errorMessage.startsWith("PHONE_MIGRATE_")) {
        console.log(`[Info] Phone registered on other DC. Migrating...`);
        sendCodeResult = await client.sendCode(
          {
            apiId,
            apiHash: apiHash.trim(),
          },
          phoneNumber
        );
      } else {
        throw err;
      }
    }

    console.log("\n📩 Code request processed by Telegram!");
    console.log(`[Telegram Info] Delivery method: ${(sendCodeResult as any)?.type?.className || "Telegram App / SMS"}`);
    console.log("👉 Check your Telegram App or SMS.");

    const code = (await question("\nEnter the Verification Code: ")).trim();

    try {
      await client.signInUser(
        {
          apiId,
          apiHash: apiHash.trim(),
        },
        {
          phoneNumber: async () => phoneNumber,
          phoneCodeHash: sendCodeResult.phoneCodeHash,
          phoneCode: async () => code,
        } as any
      );
    } catch (loginErr: any) {
      if (loginErr.errorMessage === "SESSION_PASSWORD_NEEDED") {
        const password = await question("Enter your 2FA Cloud Password: ");
        await client.signInWithPassword(
          {
            apiId,
            apiHash: apiHash.trim(),
          },
          {
            password,
          }
        );
      } else {
        throw loginErr;
      }
    }
  } else {
    // QR Code Login Flow (Bypasses SMS completely!)
    console.log("\n📱 Generating Telegram QR Code...");
    console.log("👉 Öffne auf deinem Smartphone: Telegram -> Einstellungen -> Geräte -> 'Desktop-Gerät verbinden'");
    console.log("👉 Scanne den untenstehenden QR-Code mit der Telegram-Kamera:\n");

    try {
      await client.signInUserWithQrCode(
        {
          apiId,
          apiHash: apiHash.trim(),
        },
        {
          qrCode: async (code) => {
            const loginUrl = `tg://login?token=${Buffer.from(code.token).toString("base64url")}`;
            qrcodeTerminal.generate(loginUrl, { small: true });
            console.log(`\n[QR-Code aktiv - Scanne jetzt mit Telegram -> Einstellungen -> Geräte!]`);
          },
          password: async () => {
            return (await question("\n🔐 2FA-Schutz aktiv! Gib dein Telegram 2FA Cloud-Passwort ein: ")).trim();
          },
          onError: (err) => {
            if (err.message && err.message.includes("AUTH_USER_CANCEL")) {
              return true;
            }
            return false;
          },
        }
      );
    } catch (qrErr: any) {
      if (qrErr.errorMessage === "SESSION_PASSWORD_NEEDED" || (qrErr.message && qrErr.message.includes("2FA"))) {
        const password = (await question("\n🔐 2FA-Schutz aktiv! Gib dein Telegram 2FA Cloud-Passwort ein: ")).trim();
        await client.signInWithPassword(
          {
            apiId,
            apiHash: apiHash.trim(),
          },
          {
            password,
          }
        );
      } else {
        throw qrErr;
      }
    }
  }

  console.log("\n✅ Login successful!");
  const session = client.session.save() as unknown as string;

  console.log("\n================ YOUR SESSION STRING ================");
  console.log(session);
  console.log("=====================================================");
  console.log("\nKopiere diesen String und trage ihn in Coolify / .env ein als:");
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
