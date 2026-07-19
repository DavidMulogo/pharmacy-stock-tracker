import bcrypt from "bcryptjs";
import assert from "node:assert/strict";

const lockoutThreshold = 5;

function validatePassword(password) {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function isSessionValid(cookieSessionVersion, userSessionVersion) {
  return cookieSessionVersion === userSessionVersion;
}

async function run() {
  const initialPassword = "Correct#Pass123";
  const changedPassword = "Newer#Pass456";
  const user = {
    username: "admin",
    passwordHash: await bcrypt.hash(initialPassword, 12),
    failedLoginAttempts: 0,
    lockedUntil: null,
    sessionVersion: 1,
  };

  async function login(password) {
    if (user.lockedUntil && user.lockedUntil > Date.now()) return { ok: false, locked: true };

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= lockoutThreshold) {
        user.lockedUntil = Date.now() + 15 * 60 * 1000;
      }
      return { ok: false, locked: Boolean(user.lockedUntil) };
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    return { ok: true, sessionVersion: user.sessionVersion };
  }

  assert.equal((await login(initialPassword)).ok, true, "correct login succeeds");
  assert.equal(user.failedLoginAttempts, 0, "successful login resets failure count");

  for (let index = 0; index < lockoutThreshold; index += 1) {
    await login("Wrong#Pass123");
  }
  assert.equal(Boolean(user.lockedUntil), true, "five failed logins trigger lockout");
  assert.deepEqual(await login(initialPassword), { ok: false, locked: true }, "locked account blocks even correct password");

  user.lockedUntil = null;
  user.failedLoginAttempts = 2;
  assert.equal((await login(initialPassword)).ok, true, "successful login after lock window resets failures");
  assert.equal(user.failedLoginAttempts, 0, "failure count reset after success");

  assert.equal(validatePassword("weak"), false, "weak password rejected");
  assert.equal(validatePassword(changedPassword), true, "strong password accepted");
  assert.equal(await bcrypt.compare("Wrong#Pass123", user.passwordHash), false, "wrong current password cannot change password");
  assert.equal(await bcrypt.compare(changedPassword, user.passwordHash), false, "new password is not the current password");

  const oldCookieSessionVersion = user.sessionVersion;
  user.passwordHash = await bcrypt.hash(changedPassword, 12);
  user.sessionVersion += 1;

  assert.equal(await bcrypt.compare(initialPassword, user.passwordHash), false, "old password fails after change");
  assert.equal(await bcrypt.compare(changedPassword, user.passwordHash), true, "new password works after change");
  assert.equal(isSessionValid(oldCookieSessionVersion, user.sessionVersion), false, "existing admin cookies become invalid");
  assert.equal(isSessionValid(user.sessionVersion, user.sessionVersion), true, "admin restore remains accessible after logging in again");

  console.log("Admin security verification passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
