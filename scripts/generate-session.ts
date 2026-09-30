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

function updateEnvFile(accountIndex: number, apiId: number, apiHash: string, session: string) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, "utf-8");

  const sessionKey = accountIndex === 2 ? "TELEGRAM_SESSION_STRING_2" : "TELEGRAM_SESSION_STRING";
  const apiIdKey = accountIndex === 2 ? "TELEGRAM_API_ID_2" : "TELEGRAM_API_ID";
  const apiHashKey = accountIndex === 2 ? "TELEGRAM_API_HASH_2" : "TELEGRAM_API_HASH";

  if (content.includes(`${apiIdKey}=`)) {
    const reg = new RegExp(`${apiIdKey}=".*?"`, "g");
    content = content.replace(reg, `${apiIdKey}="${apiId}"`);
  } else {
    content += `\n${apiIdKey}="${apiId}"`;
  }

  if (content.includes(`${apiHashKey}=`)) {
    const reg = new RegExp(`${apiHashKey}=".*?"`, "g");
    content = content.replace(reg, `${apiHashKey}="${apiHash}"`);
  } else {
    content += `\n${apiHashKey}="${apiHash}"`;
  }

  if (content.includes(`${sessionKey}=`)) {
    const reg = new RegExp(`${sessionKey}=".*?"`, "g");
    content = content.replace(reg, `${sessionKey}="${session}"`);
  } else {
    content += `\n${sessionKey}="${session}"`;
  }

  fs.writeFileSync(envPath, content, "utf-8");
  console.log(`💾 .env Datei wurde erfolgreich mit [${sessionKey}] aktualisiert!`);
}

async function main() {
  console.log("==================================================");
  console.log("  Telegram Multi-Userbot Login / Session Generator");
  console.log("==================================================");

  let targetAccount = 1;
  const arg = process.argv[2];

  if (arg === "2") {
    targetAccount = 2;
  } else if (arg === "1") {
    targetAccount = 1;
  } else {
    console.log("\nWelchen Userbot-Account möchtest du verknüpfen?");
    console.log("1) Userbot 1 - Haupt-Account (TELEGRAM_SESSION_STRING)");
    console.log("2) Userbot 2 - Sicherheits-Account für kritische Kanäle (TELEGRAM_SESSION_STRING_2)");
    const accChoice = (await question("Auswahl (1 oder 2, Standard = 1): ")).trim();
    if (accChoice === "2") targetAccount = 2;
  }

  console.log(`\n👉 Konfiguriere: USERBOT ${targetAccount} (${targetAccount === 2 ? "Sicherheits-Account" : "Haupt-Account"})`);

  // Allow custom API_ID / HASH per account or fallback to official Desktop credentials
  const defaultApiId = targetAccount === 2 
    ? (process.env.TELEGRAM_API_ID_2 || process.env.TELEGRAM_API_ID || "2040")
    : (process.env.TELEGRAM_API_ID || "2040");

  const defaultApiHash = targetAccount === 2
    ? (process.env.TELEGRAM_API_HASH_2 || process.env.TELEGRAM_API_HASH || "b18441a1ff607e10a989891a5462e627")
    : (process.env.TELEGRAM_API_HASH || "b18441a1ff607e10a989891a5462e627");

  const apiId = defaultApiId !== "123456" ? parseInt(defaultApiId.trim(), 10) : 2040;
  const apiHash = defaultApiHash !== "demo_hash" ? defaultApiHash.trim() : "b18441a1ff607e10a989891a5462e627";

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
    const promptText = targetAccount === 2
      ? "\nTelegram Telefonnummer des 2. Accounts eingeben (+49... / +44...): "
      : "\nTelegram Telefonnummer eingeben (+49... / +44...): ";
    const phoneInput = (await question(promptText)).trim();
    if (!phoneInput) {
      throw new Error("Telefonnummer darf nicht leer sein.");
    }
    const phoneNumber = phoneInput;
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
    console.log(`👉 Bitte Telegram-App auf deinem Handy/Desktop für ${phoneNumber} prüfen (oder SMS).`);

    const code = (await question("\nGib den 5-stelligen Bestätigungscode ein: ")).trim();

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
    console.log("👉 Öffne auf dem Smartphone dieses Accounts: Telegram -> Einstellungen -> Geräte -> 'Desktop-Gerät verbinden'");
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
  console.log(`\n✅ Login erfolgreich für Userbot ${targetAccount}!`);
  console.log(`Benutzer: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "n/a"})`);
  console.log(`Nummer: +${me.phone}`);
  console.log(`User ID: ${me.id}`);

  const session = client.session.save() as unknown as string;

  console.log("\n================ SESSION ERSTELLT ================");
  updateEnvFile(targetAccount, apiId, apiHash, session);
  console.log("==================================================");

  if (targetAccount === 2) {
    console.log("\n📋 HINWEIS FÜR COOLIFY:");
    console.log("Trage folgende Variable in Coolify (Environment Variables) ein:");
    console.log(`TELEGRAM_SESSION_STRING_2="${session}"\n`);
  }

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Anmeldung fehlgeschlagen:", err.message || err);
  rl.close();
  process.exit(1);
});
