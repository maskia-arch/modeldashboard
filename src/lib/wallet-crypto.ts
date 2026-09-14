import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getEncryptionKey(): Buffer {
  const secret =
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    "dev-secret-key-32-chars-minimum-autoacts";
  // Hash secret with SHA-256 to ensure exact 32 bytes (256 bits)
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts an array of 24 mnemonic words into a secure AES-256-GCM payload.
 * Returns format: `${ivHex}:${authTagHex}:${encryptedHex}`
 */
export function encryptMnemonic(words: string[]): string {
  const cleanWords = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (cleanWords.length !== 24) {
    throw new Error("Zur Verschlüsselung müssen genau 24 Wörter vorliegen.");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const text = cleanWords.join(" ");
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an encrypted payload back into the 24 mnemonic words.
 */
export function decryptMnemonic(payload: string): string[] {
  if (!payload || typeof payload !== "string") {
    throw new Error("Ungültiges Verschlüsselungs-Payload.");
  }

  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Ungültiges Wallet-Schlüsselformat.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  const words = decrypted.trim().split(/\s+/);
  if (words.length !== 24) {
    throw new Error("Entschlüsselte Mnemonic ist unvollständig.");
  }

  return words;
}
