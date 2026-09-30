import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import qrcodeTerminal from "qrcode-terminal";
import readline from "readline";
import fs from "fs";
import path from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function updateEnvFile(apiId: number, apiHash: string, session: string) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, "utf-8");

  if (content.includes("TELEGRAM_API_ID=")) {
    content = content.replace(/TELEGRAM_API_ID=".*?"/g, `TELEGRAM_API_ID="${apiId}"`);
  } else {
    content += `\nTELEGRAM_API_ID="${apiId}"`;
  }

  if (content.includes("TELEGRAM_API_HASH=")) {
    content = content.replace(/TELEGRAM_API_HASH=".*?"/g, `TELEGRAM_API_HASH="${apiHash}"`);
  } else {
    content += `\nTELEGRAM_API_HASH="${apiHash}"`;
  }

  if (content.includes("TELEGRAM_SESSION_STRING=")) {
    content = content.replace(/TELEGRAM_SESSION_STRING=".*?"/g, `TELEGRAM_SESSION_STRING="${session}"`);
  } else {
    content += `\nTELEGRAM_SESSION_STRING="${session}"`;
  }

  fs.writeFileSync(envPath, content, "utf-8");
  console.log("💾 .env Datei wurde automatisch mit der neuen Session aktualisiert!");
}

async function main() {
  console.log("==================================================");
  console.log("  Telegram Userbot Login / Session Generator     ");
  console.log("==================================================");

  const envApiId = process.env.TELEGRAM_API_ID;
  const envApiHash = process.env.TELEGRAM_API_HASH;

  // Use Telegram Desktop official API credentials as standard defaults
  const apiId = (envApiId && envApiId !== "123456") ? parseInt(envApiId.trim(), 10) : 2040;
  const apiHash = (envApiHash && envApiHash !== "demo_hash") ? envApiHash.trim() : "b18441a1ff607e10a989891a5462e627";

  const stringSession = new StringSession("");

  console.log("\nVerbinde mit dem Telegram-Netzwerk...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  console.log("\n================ LOGIN METHODE ================");
  console.log("1) Telefonnummer & In-App Code / SMS (EMPFOHLEN)");
  console.log("2) QR-Code scannen");
  console.log("===============================================");
  const choice = (await question("Wähle Methode (1 oder 2, Standard = 1): ")).trim() || "1";

  if (choice === "1") {
    // Phone / SMS Flow
    const defaultPhone = "+447438600294";
    const phoneInput = (await question(`\nTelegram Telefonnummer eingeben [Standard: ${defaultPhone}]: `)).trim();
    const phoneNumber = phoneInput || defaultPhone;
    console.log(`\nFordere Bestätigungscode von Telegram für ${phoneNumber} an...`);

    let sendCodeResult;
    try {
      sendCodeResult = await client.sendCode(
        {
          apiId,
          apiHash,
        },
        phoneNumber
      );
    } catch (err: any) {
      if (err.errorMessage && err.errorMessage.startsWith("PHONE_MIGRATE_")) {
        console.log(`[Info] Telefonnummer liegt auf anderem DC. Migriere...`);
        sendCodeResult = await client.sendCode(
          {
            apiId,
            apiHash,
          },
          phoneNumber
        );
      } else {
        throw err;
      }
    }

    console.log("\n📩 Code wurde von Telegram gesendet!");
    console.log(`👉 Bitte Telegram-App auf deinem Handy/Desktop prüfen (oder SMS).`);

    const code = (await question("\nGib den Bestätigungscode ein: ")).trim();

    try {
      await client.signInUser(
        {
          apiId,
          apiHash,
        },
        {
          phoneNumber: async () => phoneNumber,
          phoneCodeHash: sendCodeResult.phoneCodeHash,
          phoneCode: async () => code,
        } as any
      );
    } catch (loginErr: any) {
      if (loginErr.errorMessage === "SESSION_PASSWORD_NEEDED") {
        const password = await question("\n🔐 2FA Cloud-Passwort eingeben: ");
        await client.signInWithPassword(
          {
            apiId,
            apiHash,
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
    // QR Code Login Flow
    console.log("\n📱 Generiere Telegram QR-Code...");
    console.log("👉 Öffne auf deinem Smartphone: Telegram -> Einstellungen -> Geräte -> 'Desktop-Gerät verbinden'");
    console.log("👉 Scanne den untenstehenden QR-Code mit der Telegram-Kamera:\n");

    try {
      await client.signInUserWithQrCode(
        {
          apiId,
          apiHash,
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
            apiHash,
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

  const me: any = await client.getMe();
  console.log("\n✅ Login erfolgreich!");
  console.log(`Benutzer: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "n/a"})`);
  console.log(`Nummer: +${me.phone}`);

  const session = client.session.save() as unknown as string;

  console.log("\n================ SESSION ERSTELLT ================");
  updateEnvFile(apiId, apiHash, session);
  console.log("==================================================");

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Anmeldung fehlgeschlagen:", err.message || err);
  rl.close();
  process.exit(1);
});
