# Grant VC Play Super Admin access (one time)

This procedure runs locally on your computer using Firebase Admin SDK. **Never commit or send the service-account JSON/private key to GitHub or anyone else.**

## 1. Get the Firebase Authentication UID
1. Open Firebase Console → Authentication → Users.
2. Select your Google account.
3. Copy its **User UID** (not the email and not the password).

## 2. Create a private service-account key
1. Open Project settings → Service accounts in the Firebase Console.
2. Generate a new private key for project `bagh-chal-5dc2f`.
3. Save the downloaded JSON somewhere private on your computer, outside this repository. Do not upload it or paste its contents into chat.

## 3. Run the one-time script
Install Node.js if needed, then from the repository folder run:

```bash
npm install firebase-admin
```

Set the path to the private JSON file and replace `PASTE_AUTH_UID_HERE` with the UID copied in step 1:

**macOS / Linux**
```bash
GOOGLE_APPLICATION_CREDENTIALS="/full/private/path/service-account.json" \
CONFIRM_SUPER_ADMIN="I_UNDERSTAND_THIS_GRANTS_FULL_ADMIN_ACCESS" \
node scripts/grant-super-admin.js PASTE_AUTH_UID_HERE
```

The script preserves any existing custom claims and adds `superAdmin: true` to that one Firebase user.

## 4. Sign in again
Open https://viralcage.com/admin/, sign out if already signed in, then choose **Continue with Google** again.

## Security notes
- Only run this for the Google account you control.
- Keep the service-account JSON private. Delete the local key after the one-time operation, or securely store it if you need it for other administration.
- This grants the admin dashboard's current custom-claim gate. It does **not** enable the preview moderation buttons or create secure moderation APIs.
- Do not change Realtime Database rules based on this claim until the actual game access patterns have been reviewed.
- This setup does not edit `index.html` or any game files.
