const crypto = require("crypto");

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const createUserIdFromEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);

  return crypto
    .createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")
    .slice(0, 18);
};

const createHouseholdIdFromUserId = (userId) => {
  return `hh_${userId}`;
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(String(password), salt, 100000, 64, "sha512")
    .toString("hex");

  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedPasswordHash) => {
  if (!storedPasswordHash || !storedPasswordHash.includes(":")) {
    return false;
  }

  const [salt, originalHash] = storedPasswordHash.split(":");

  const hash = crypto
    .pbkdf2Sync(String(password), salt, 100000, 64, "sha512")
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(originalHash, "hex")
  );
};

const createSessionToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

module.exports = {
  normalizeEmail,
  createUserIdFromEmail,
  createHouseholdIdFromUserId,
  hashPassword,
  verifyPassword,
  createSessionToken,
};
