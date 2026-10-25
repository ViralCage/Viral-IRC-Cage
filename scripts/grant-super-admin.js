#!/usr/bin/env node
'use strict';

/*
 * One-time local bootstrap for the VC Play Super Admin custom claim.
 * Never upload a service-account JSON file or private key to GitHub.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS="/private/path/service-account.json" \
 *     node scripts/grant-super-admin.js FIREBASE_AUTH_UID
 */
const admin = require('firebase-admin');

async function main() {
  const uid = process.argv[2];
  if (!uid || uid.length < 10) {
    throw new Error('Usage: node scripts/grant-super-admin.js FIREBASE_AUTH_UID');
  }
  if (process.env.CONFIRM_SUPER_ADMIN !== 'I_UNDERSTAND_THIS_GRANTS_FULL_ADMIN_ACCESS') {
    throw new Error('Set CONFIRM_SUPER_ADMIN=I_UNDERSTAND_THIS_GRANTS_FULL_ADMIN_ACCESS to confirm.');
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the local service-account JSON path.');
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const auth = admin.auth();
  const user = await auth.getUser(uid);
  const existing = user.customClaims || {};
  await auth.setCustomUserClaims(uid, { ...existing, superAdmin: true });
  console.log('Granted superAdmin=true to:', user.email || '(no email)', 'UID:', uid);
  console.log('Sign out of the admin page and sign in again to refresh the token.');
  await admin.app().delete();
}

main().catch((error) => {
  console.error('Could not grant Super Admin:', error.message);
  process.exitCode = 1;
});
