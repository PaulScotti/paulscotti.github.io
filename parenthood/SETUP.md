# Setting up /parenthood (about 5 minutes, once)

No accounts, databases or cloud consoles. The digests are stored **encrypted** on this repo's `parenthood-data`
branch, and the site decrypts them in your browser with a family password you each enter once per device.

## Before you start

- **GitHub CLI signed in**: `gh auth status` (you already are on this Mac).
- **A Gmail app password** for the account that sends the nightly emails: open
  <https://myaccount.google.com/apppasswords>, create one named `parenthood`, keep the 16 letters handy.
  (Requires 2-Step Verification on that Google account.)
- **A Claude token**: in a separate terminal tab run `claude setup-token`, sign in, and keep the token it prints.
  It uses your Claude subscription and lasts a year.

## Run one command

```bash
cd ~/Documents/GitHub/paulscotti.github.io
node parenthood/pipeline/setup.mjs
```

It will:

1. **Ask for the family password**: at least 7 characters, case-sensitive (or press Enter to generate a random
   7-character one). Because the encrypted files are publicly downloadable, pick something random-looking that
   mixes upper and lower case with a number, not a name, word or date. Save it in your password manager and share
   it with Yoolim privately; it can't be recovered later.
2. **Encrypt the private profile and Days 1–2** and push them to the `parenthood-data` branch.
3. **Save the GitHub secrets** the daily jobs need: the password, the Gmail address and app password, and the
   Claude token. It asks for each one and never prints them.

## Then

1. Open <https://www.paulscotti.com/parenthood/> on each phone, enter the password, and pick who's reading
   (Paul → English, 유이 → Korean; the **EN / 한** switch changes it any time). Safari's password manager can save
   it too.
2. Test the nightly email: GitHub → **Actions → parenthood-email → Run workflow**.
3. Each day **parenthood-generate** writes that day's digest (it starts around 6am Pacific and retries into the
   afternoon); at 8:30pm you both get the email.

## Day to day

| You want to… | Do this |
|---|---|
| Tell the digest something (new results, an appointment, a worry, a topic) | Reply to any nightly email, or email `<your gmail>+digest@gmail.com` |
| Say you're pregnant / the baby arrived | Same: e.g. "Positive test today, last period started Jan 5." The curriculum follows your weeks from then on |
| Re-run or redo a day | Actions → parenthood-generate → Run workflow (date, *force*) |
| Change the model | Repo variable `PARENTHOOD_MODEL` (default `opus`) |
| Update the private profile | Edit `parenthood/pipeline/private/profile.json`, rerun `node parenthood/pipeline/setup.mjs` |
| Republish edited seed digests | `node parenthood/pipeline/setup.mjs --reseed --no-secrets` |
| Fix the nightly email ("Gmail rejected the login" in the run log) | `node parenthood/pipeline/setup.mjs --gmail`: enter a new app password; it tests the login before saving |
| Back up everything decrypted | **Us → Download our digests**, or `PARENTHOOD_PASSPHRASE=… node parenthood/pipeline/export.mjs` |
| Lock a device (e.g. a shared computer) | **Us → Lock this device** |

If a day's generation fails, the site owner gets an email instead of the nightly digest, and the workflow run shows why.
