# Pintail

Paul's tasks as one todo.txt, at [paulscotti.com/pintail](https://www.paulscotti.com/pintail/), on a laptop and as an
installed app on his Pixel. Plain HTML, CSS and JavaScript, with a Cloudflare Worker keeping the list in sync.

## Three horizons, and the pin

- **Soon** is everything with a date: overdue, today, each of the next six days, then by month. **Move to today**
  brings everything overdue to today at once.
- **Later** is everything undated, by category, the most important and then the newest first. The age on the right
  shows how long a task has waited.
- **Routines** are the repeating tasks, with their next date and a row of marks for when each was done lately: one
  per day for two weeks, or per week or month for slower ones.
- **Done** is what's been finished, by day and then by month.
- **Pinned** tasks sit above all of these, on every view and whatever the categories chosen, with the day each was
  pinned. A pintail is named for its long pointed tail: while anything is pinned, the tail of the pintail in the
  masthead turns the accent colour, and the pin itself is drawn as that tail. Done unpins, and a routine's next
  date comes back unpinned.

On a laptop Soon, Later and Routines sit side by side and Done replaces them; on a phone each is a tab. The
categories along the top are the `@contexts`; any number can be chosen. A task added without a category gets the
first one chosen.

Type a task in the box and press Enter. A date or repeat said at the end becomes its date: "tomorrow", "fri", "next
week", "oct 20", "in 3 days", "this weekend", "every weekday", "every monday", "monthly on the 1st". What will be
saved shows under the box as it's typed, and **Keep words** keeps the words as written. `(A)` at the start sets a
priority, and `@` suggests the categories that exist. Pasting several lines adds one task per line, without their
list bullets.

Tap a task to open it: its words, notes, date, repeat, priority (A, B or C), categories, steps (subtasks) and pin,
each changed in place. **Skip** moves a routine to its next date without marking it done. Every change can be undone
from the note at the bottom, or with Cmd/Ctrl+Z. On a laptop, `n` goes to the add box, `/` searches every task, open
or done, `j` and `k` move between tasks, Enter opens one, `x` marks it done and `p` pins it. The lines button at the
top opens the whole todo.txt for editing by hand, where Tab makes a step and Cmd/Ctrl+Enter saves.

On the Pixel, Chrome's **Install app** puts Pintail on the home screen. Its icon's long-press has **Add task**, and
text or links shared from another app open in the add box.

## The format

Each line is a task, as in [todo.txt](https://github.com/todotxt/todo.txt), and a leading tab makes it a step of
the task above:

```text
(A) 2026-10-13 Send the grant budget @Work due:2026-10-15 pin:2026-10-14 notes:"Use the new template"
	2026-10-13 Ask Sam for the numbers @Work
x 2026-10-14 2026-10-08 Journal for 5 minutes @Personal due:2026-10-14 rec:+1b
```

Pintail reads `x` and its date, the priority, the created date, `@contexts`, `due:`, `rec:`, `notes:` (quoted, with
`\n` for new lines) and `pin:` (the day it was pinned). Anything else stays in the task's words as written, and so
does a date that isn't on the calendar. `rec:` takes a number and d, b (weekdays), w, m or y. With a `+` it keeps the
schedule: the next date is the first one after today, so missed days are skipped, not owed. Without it, the next
date counts from the day it's done. Done marks a task's open steps done too.

## Sync

The Worker keeps every saved version of the todo.txt in D1 (every version for 30 days, then one a day). Each device
keeps its copy in localStorage and works offline. An edit is sent with the version it was made from; if another
device saved first, the Worker sends its text back, the two are merged line by line, and the result is sent again.
A line only one side changed takes that side; a task both changed differently keeps both versions. Undo uses the
same merge, so it takes back one change and nothing else. A request that stalls for 20 seconds counts as offline and
is tried again.

Scripts and agents can use the same file with the password:

```sh
curl -sD - -H "authorization: Bearer $KEY" https://pintail.scottibrain.workers.dev/todo.txt       # the ETag is the version
curl -X PUT -H "authorization: Bearer $KEY" -H 'if-match: "42"' --data-binary @todo.txt https://pintail.scottibrain.workers.dev/todo.txt
```

A PUT is refused with 412 and the current text when the version has moved on. Read it again, redo the change, and
send it with the new version. Cloudflare sends the ETag as `W/"42"` when it compresses a response; either form works.

## Development

`todo.js` holds the format, dates, repeats, quick-add phrases and the merge; `node --test todo.test.js` checks them.
`.claude/launch.json` at the repo root runs the page (`pintail`, port 8481) and the Worker (`pintail-worker`, port
8790); on localhost the page talks to the local Worker and there's no service worker. The local Worker's password is
a throwaway in `worker/.dev.vars`. The first time, create the table with
`npx wrangler d1 execute pintail --local --file schema.sql` from `worker/`. Two origins, localhost and 127.0.0.1,
act as two devices.

To release, raise `VERSION` in `sw.js`, so installed copies offer **Update**. Deploy the Worker with
`npx wrangler deploy` from `worker/`; its secret `KEY` is the password shared with ebis, myna and paisano.
