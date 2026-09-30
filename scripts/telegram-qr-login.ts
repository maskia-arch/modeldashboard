import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import QRCode from "qrcode";
import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

const API_ID = 2040;
const API_HASH = "b18441a1ff607e10a989891a5462e627";
const PORT = 5555;
const ARTIFACT_DIR = "C:\\Users\\Laptop\\.gemini\\antigravity\\brain\\e65a7776-07ed-453f-b166-7910b770ae41";

let currentLoginUrl = "";
let currentQrPngBuffer: Buffer | null = null;
let currentStatus = "connecting"; // connecting | ready | scanning | 2fa | success | error
let statusMessage = "Verbinde mit Telegram MTProto Server...";
let authenticatedUser: any = null;
let sessionResult = "";

let twoFactorResolve: ((pwd: string) => void) | null = null;

// HTTP Server for live browser view
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Userbot Login - QR-Code</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1e293b; border-radius: 20px; border: 1px solid #334155; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    h1 { font-size: 24px; font-weight: 700; color: #38bdf8; margin-bottom: 8px; }
    p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .badge { display: inline-block; background: #0369a1; color: #e0f2fe; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .qr-container { background: #ffffff; padding: 16px; border-radius: 16px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); margin-bottom: 20px; min-width: 256px; min-height: 256px; }
    .qr-container img { display: block; width: 256px; height: 256px; }
    .steps { text-align: left; background: #0f172a; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; border: 1px solid #1e293b; }
    .steps ol { padding-left: 20px; font-size: 14px; color: #cbd5e1; line-height: 1.7; }
    .steps strong { color: #38bdf8; }
    .status-box { font-size: 14px; padding: 12px; border-radius: 10px; margin-bottom: 16px; font-weight: 500; }
    .status-waiting { background: #1e1b4b; color: #a5b4fc; border: 1px solid #4338ca; }
    .status-success { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
    .status-2fa { background: #78350f; color: #fde68a; border: 1px solid #d97706; }
    .btn { display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; transition: background 0.2s; width: 100%; }
    .btn:hover { background: #0369a1; }
    .two-fa-form { margin-top: 16px; text-align: left; }
    .two-fa-form input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; margin-bottom: 10px; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Rufnummer: +44 7438600294</div>
    <h1>Telegram Userbot Login</h1>
    <p class="subtitle">Scanne diesen QR-Code mit der Telegram-App</p>

    <div class="qr-container">
      <img id="qr-img" src="/qr.png" alt="Telegram QR-Code" />
    </div>

    <div id="status-box" class="status-box status-waiting">
      <span id="status-text">${statusMessage}</span>
    </div>

    <div class="steps">
      <ol>
        <li>Öffne <strong>Telegram</strong> auf deinem Handy</li>
        <li>Tippe auf <strong>Einstellungen</strong> ➔ <strong>Geräte</strong></li>
        <li>Wähle <strong>Desktop-Gerät verbinden</strong></li>
        <li>Halte die Kamera auf den QR-Code oben</li>
      </ol>
    </div>

    <div id="direct-btn-container" style="margin-bottom: 16px;">
      <a id="direct-link" href="${currentLoginUrl}" class="btn" style="background: #334155;">In Telegram Desktop öffnen</a>
    </div>

    <div id="two-fa-container" class="two-fa-form" style="display: none;">
      <label style="display: block; font-size: 13px; color: #fde68a; margin-bottom: 6px; font-weight: 600;">2FA Cloud-Passwort erforderlich:</label>
      <input type="password" id="two-fa-input" placeholder="Telegram 2FA Passwort eingeben..." />
      <button class="btn" style="background: #d97706;" onclick="submit2FA()">Passwort bestätigen</button>
    </div>
  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        
        document.getElementById('status-text').innerText = data.message;
        const statusBox = document.getElementById('status-box');
        const directLink = document.getElementById('direct-link');
        const twoFaContainer = document.getElementById('two-fa-container');

        if (data.loginUrl) {
          directLink.href = data.loginUrl;
        }

        if (data.status === 'success') {
          statusBox.className = 'status-box status-success';
          twoFaContainer.style.display = 'none';
        } else if (data.status === '2fa') {
          statusBox.className = 'status-box status-2fa';
          twoFaContainer.style.display = 'block';
        } else {
          statusBox.className = 'status-box status-waiting';
          twoFaContainer.style.display = 'none';
        }

        // reload QR image cache buster
        document.getElementById('qr-img').src = '/qr.png?t=' + Date.now();
      } catch (e) {}
    }

    setInterval(checkStatus, 3000);

    async function submit2FA() {
      const pwd = document.getElementById('two-fa-input').value;
      if (!pwd) return alert('Bitte Passwort eingeben');
      const res = await fetch('/submit-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById('status-text').innerText = 'Passwort übermittelt, prüfe Anmeldung...';
      }
    }
  </script>
</body>
</html>`);
    return;
  }

  if (url.pathname === "/qr.png") {
    if (currentQrPngBuffer) {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end(currentQrPngBuffer);
    } else {
      res.writeHead(404);
      res.end("Not ready");
    }
    return;
  }

  if (url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: currentStatus,
        message: statusMessage,
        loginUrl: currentLoginUrl,
        user: authenticatedUser,
      })
    );
    return;
  }

  if (url.pathname === "/submit-2fa" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { password } = JSON.parse(body);
        if (twoFactorResolve && password) {
          twoFactorResolve(password);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
      } catch {}
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[Web Server] Running at http://localhost:${PORT}`);
});

async function main() {
  console.log("==================================================");
  console.log("  TELEGRAM USERBOT QR-CODE LOGIN                  ");
  console.log("  Target: +44 7438600294                          ");
  console.log("==================================================");

  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  statusMessage = "Verbinde mit Telegram MTProto Server...";
  await client.connect();
  console.log("Connected to Telegram Network.");

  let openedBrowser = false;

  try {
    await client.signInUserWithQrCode(
      { apiId: API_ID, apiHash: API_HASH },
      {
        qrCode: async (code) => {
          const tokenBase64 = Buffer.from(code.token).toString("base64url");
          currentLoginUrl = `tg://login?token=${tokenBase64}`;
          currentStatus = "ready";
          statusMessage = "QR-Code aktiv! Bitte mit Telegram auf dem Handy scannen.";

          // Generate PNG buffer
          currentQrPngBuffer = await QRCode.toBuffer(currentLoginUrl, {
            errorCorrectionLevel: "M",
            width: 400,
            margin: 2,
          });

          // Save to artifacts and public
          try {
            if (!fs.existsSync(ARTIFACT_DIR)) {
              fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
            }
            fs.writeFileSync(path.join(ARTIFACT_DIR, "telegram_qr.png"), currentQrPngBuffer);
            const publicDir = path.join(process.cwd(), "public");
            if (!fs.existsSync(publicDir)) {
              fs.mkdirSync(publicDir, { recursive: true });
            }
            fs.writeFileSync(path.join(publicDir, "telegram-qr.png"), currentQrPngBuffer);
          } catch (e: any) {
            console.error("Error writing QR png file:", e.message);
          }

          console.log("\n==================================================");
          console.log(`[QR-TOKEN AKTUALISIERT] (Gültig für 30s)`);
          console.log(`Direct Link: ${currentLoginUrl}`);
          console.log(`Web Interface: http://localhost:${PORT}`);
          console.log("==================================================");

          // Render ASCII QR
          const qrAscii = await QRCode.toString(currentLoginUrl, { type: "terminal", small: true });
          console.log(qrAscii);

          // Write current qr info to a json file for external observation
          fs.writeFileSync(
            path.join(ARTIFACT_DIR, "telegram_qr_state.json"),
            JSON.stringify({
              loginUrl: currentLoginUrl,
              expires: code.expires,
              timestamp: Date.now(),
            })
          );

          if (!openedBrowser) {
            openedBrowser = true;
            exec(`start http://localhost:${PORT}`);
          }
        },
        password: async () => {
          currentStatus = "2fa";
          statusMessage = "2FA Cloud-Passwort benötigt! Bitte auf der Webseite oder im Terminal eingeben.";
          console.log("\n🔐 [2FA NEEDED] Telegram Cloud Password (2FA) is required!");
          return new Promise<string>((resolve) => {
            twoFactorResolve = resolve;
          });
        },
        onError: (err) => {
          if (err.message && err.message.includes("AUTH_USER_CANCEL")) {
            return true;
          }
          return false;
        },
      }
    );
  } catch (err: any) {
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED" || (err.message && err.message.includes("2FA"))) {
      currentStatus = "2fa";
      statusMessage = "2FA Cloud-Passwort benötigt!";
      const pwd = await new Promise<string>((resolve) => {
        twoFactorResolve = resolve;
      });
      await client.signInWithPassword({ apiId: API_ID, apiHash: API_HASH }, { password: pwd });
    } else {
      currentStatus = "error";
      statusMessage = `Fehler: ${err.message || err}`;
      throw err;
    }
  }

  // Login was successful!
  currentStatus = "success";
  const session = client.session.save() as unknown as string;
  sessionResult = session;

  const me: any = await client.getMe();
  authenticatedUser = {
    id: String(me.id),
    firstName: me.firstName,
    lastName: me.lastName,
    username: me.username,
    phone: me.phone,
  };

  statusMessage = `✅ Erfolgreich eingeloggt als ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "kein_username"}, +${me.phone})!`;
  console.log("\n==================================================");
  console.log("  LOGIN ERFOLGREICH!");
  console.log(`  Benutzer: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "n/a"})`);
  console.log(`  Telefonnummer: +${me.phone}`);
  console.log(`  User ID: ${me.id}`);
  console.log("==================================================");

  // Update .env file
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");

    // Replace or add TELEGRAM_API_ID
    if (envContent.includes("TELEGRAM_API_ID=")) {
      envContent = envContent.replace(/TELEGRAM_API_ID=".*?"/g, `TELEGRAM_API_ID="${API_ID}"`);
    } else {
      envContent += `\nTELEGRAM_API_ID="${API_ID}"`;
    }

    // Replace or add TELEGRAM_API_HASH
    if (envContent.includes("TELEGRAM_API_HASH=")) {
      envContent = envContent.replace(/TELEGRAM_API_HASH=".*?"/g, `TELEGRAM_API_HASH="${API_HASH}"`);
    } else {
      envContent += `\nTELEGRAM_API_HASH="${API_HASH}"`;
    }

    // Replace or add TELEGRAM_SESSION_STRING
    if (envContent.includes("TELEGRAM_SESSION_STRING=")) {
      envContent = envContent.replace(/TELEGRAM_SESSION_STRING=".*?"/g, `TELEGRAM_SESSION_STRING="${session}"`);
    } else {
      envContent += `\nTELEGRAM_SESSION_STRING="${session}"`;
    }

    fs.writeFileSync(envPath, envContent, "utf-8");
    console.log("[Info] .env Datei erfolgreich aktualisiert mit neuem TELEGRAM_SESSION_STRING!");
  }

  // Save session state to artifact
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "telegram_session.json"),
    JSON.stringify(
      {
        user: authenticatedUser,
        session,
        apiId: API_ID,
        apiHash: API_HASH,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log("\nServer bleibt noch 30 Sekunden aktiv zur Ansicht im Browser...");
  setTimeout(() => {
    process.exit(0);
  }, 30000);
}

main().catch((err) => {
  currentStatus = "error";
  statusMessage = `Fehler: ${err.message || err}`;
  console.error("Login-Prozess fehlgeschlagen:", err);
  setTimeout(() => process.exit(1), 10000);
});
