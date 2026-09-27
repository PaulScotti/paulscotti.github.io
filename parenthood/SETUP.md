# Setting up /parenthood (about 15 minutes, once)

The site code is live on GitHub Pages already. What's missing are the private pieces that can't live in a
public repo: a Firebase project (Google sign-in + the private database), and three GitHub secrets for the daily
research job and the nightly email.

Nothing below is shared with anyone: the Firebase project is yours, the digests live in its database, and only the
two invited Google accounts can read them.

---

## 1. Create the Firebase project (browser, ~5 min)

Signed in as your personal Google account at <https://console.firebase.google.com>:

1. **Create a project** → name it e.g. `parenthood-py` → turn **off** Google Analytics → Create.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** → choose your support email → Save.
3. **Authentication → Settings → Authorized domains → Add domain** → `www.paulscotti.com` (add `paulscotti.com` too).
4. **Build → Firestore Database → Create database** → *Production mode* → location **us-west1** → Enable.
5. **Project settings (gear) → General → Your apps → Web `</>`** → nickname `parenthood` → Register app.
   Copy the `firebaseConfig = { … }` snippet into a text file, e.g. `~/Downloads/firebase-config.txt`.
6. **Project settings → Service accounts → Generate new private key** → saves a JSON key to Downloads.

## 2. Make phone sign-in bulletproof (browser, ~1 min, recommended)

This lets sign-in work the same way in Safari, Chrome, Gmail's in-app browser and home-screen shortcuts.

<https://console.cloud.google.com/apis/credentials> → pick the Firebase project → **OAuth 2.0 Client IDs →
"Web client (auto created by Google Service)"**:

- **Authorized JavaScript origins** → add `https://www.paulscotti.com`
- **Authorized redirect URIs** → add `https://www.paulscotti.com/__/auth/handler`
- Save.

(Skip this step and leave off `--self-host-auth` below if you'd rather not; sign-in then uses a popup window,
which works in regular Safari/Chrome.)

## 3. Connect the site (terminal, ~2 min)

```bash
cd ~/Documents/GitHub/paulscotti.github.io/parenthood/pipeline
npm ci
node setup.mjs --key ~/Downloads/<project>-firebase-adminsdk-<id>.json --config ~/Downloads/firebase-config.txt --self-host-auth
```

This writes `parenthood/js/config.js` (public by design), puts Firebase's sign-in helper at `/__/auth/`, deploys the
Firestore security rules (only your two accounts can read anything), and loads the private profile and Day 1.

Then publish those two changes:

```bash
cd ~/Documents/GitHub/paulscotti.github.io
git add parenthood/js/config.js __ && git commit -m "Connect parenthood site to Firebase" && git push
```

## 4. Add the GitHub secrets (terminal, ~5 min)

```bash
cd ~/Documents/GitHub/paulscotti.github.io
gh secret set FIREBASE_SERVICE_ACCOUNT < ~/Downloads/<project>-firebase-adminsdk-<id>.json
claude setup-token                 # sign in to Claude; copy the long-lived token it prints
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # paste the token
gh secret set GMAIL_USER           # your Gmail address (the emails are sent from it)
gh secret set GMAIL_APP_PASSWORD   # paste a 16-character app password from https://myaccount.google.com/apppasswords
```

- The Claude token uses your Claude subscription (valid for a year). To bill the API instead, set
  `ANTHROPIC_API_KEY` rather than `CLAUDE_CODE_OAUTH_TOKEN`.
- App passwords require 2-Step Verification on the Google account.
- Afterwards, move the service-account key out of Downloads (e.g. into your password manager) and delete the file.

## 5. Check it

1. Open <https://www.paulscotti.com/parenthood/> on each phone and sign in once. You stay signed in on that device.
   Each account opens in its own language (set in the private member list); the **EN / 한** switch changes it any time.
2. GitHub → **Actions → parenthood-email → Run workflow** sends tonight's email immediately (a good test).
3. Tomorrow at ~6am Pacific, **parenthood-generate** writes Day 2; at 9:30pm you both get the email.

---

## Day to day

| You want to… | Do this |
|---|---|
| Tell the digest something (new results, appointment, worry) or request a topic | **Us → Tell the digest** on the site |
| Mark that you're pregnant / baby arrived | **Us → Where we are** (the curriculum follows your weeks) |
| Rate a digest | Buttons at the end of each digest (*Helpful / Go deeper / Knew this*) |
| Bring questions to an appointment | **Doctor** page → *Copy in English* |
| Re-run or redo a day | Actions → parenthood-generate → Run workflow (date, *force*) |
| Change the model | Repo variable `PARENTHOOD_MODEL` (default `opus`) |
| Update the private profile | Edit `pipeline/private/profile.json`, rerun `node setup.mjs --key …` |
| Back up everything | `node pipeline/export.mjs --key …` (or *Download our data* on the Us page) |

If a day's generation fails, the site owner gets an email instead of the nightly digest, and the workflow run shows why.
