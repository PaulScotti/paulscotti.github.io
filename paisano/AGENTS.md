## Work
- Don't wander beyond what I asked. If you spot something else worth doing, tell me.
- Don't make things up. If you can't source a date, number, or fact, say it's unknown.
- Commit often, but never push or deploy anything live unless I say so.
- Keep replies short and plain: what you changed, how you checked it, and anything still broken. No em dashes or AI-isms.
- My guiding light towards function apps are: simple, minimalist, elegant, robust, and a delight to interact with.

## Code
- Less code is better. Keep things flat and hackable like nanochat: few files, few dependencies, few lines. Before writing something new, check whether the repo, the standard library, or the browser already does it. 
- No try/except, fallbacks, or defensive checks. If something is wrong, it should fail loudly so we fix the real cause.
- I hate tiny helper functions and classes that are only used once. Put the code where it's needed.
- Hardcode values that won't change. No argparse, and env vars only for secrets. Anything I tune often goes in one obvious place, like a YAML config.
- Prefer general solutions over rules tuned by hand, like regexes or thresholds that only fix the case in front of you.
- When something is replaced, delete the old version completely. Keep comments short (how and why) and docs accurate. Ideally your code changes in response to my asks lead to *less* lines of code, not more.
- Python: uv and plain PyTorch. Web: plain HTML/CSS/JS unless a framework is really needed (then React + Vite), with Cloudflare Workers for backends. Personal apps get one password per device, not accounts.

## Apps
- Keep it simple. Every button, toggle, setting, and line of text should earn its place.
- I shouldn't have to set anything up: my keys and config are already there, logins are remembered, and updates take one step.
- I like a calm, editorial look (serif type, muted colors, thin lines) unless I give you a reference design. Use Libron font.

## Checking your work
- Actually run the app and use it like I would, at phone and desktop sizes. Reproduce bugs the way I hit them.
- After big changes, look again with fresh eyes and try to break it.
- Back up claims with experiments. A difference within noise isn't an improvement.
- Only write tests that check something meaningful, most unit tests are wasteful code

