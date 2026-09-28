// Where the encrypted digests live: the repo's `parenthood-data` branch, served by GitHub's raw CDN.
// Everything there is AES-GCM encrypted; only the family passphrase unlocks it (see js/store.js).
export const DATA_URL = 'https://raw.githubusercontent.com/PaulScotti/paulscotti.github.io/parenthood-data/';
