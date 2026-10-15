# Godwit

Paul's tasks as one todo.txt, at [paulscotti.com/godwit](https://www.paulscotti.com/godwit/), on a laptop and as an
installed app on his Pixel. Plain HTML, CSS and JavaScript, with a Cloudflare Worker keeping the list in sync.

## Three horizons

- **Soon** is everything with a date: overdue, today, each of the next six days, then by month.
- **Later** is everything undated, by priority: A, B, C, unprioritized, deprioritized (D) and waiting (W). The age
  on the right shows how long a task has waited.
- **Routines** are the repeating tasks, with their next date and a row of marks for when each was done lately: one
  per day for two weeks, or per week or month for slower ones.
- **Done** is what's been finished, by day and then by month.

On a laptop the first three sit side by side and Done replaces them; on a phone each is a tab. The categories along
the top are the `@contexts`; any number can be chosen, and a new device starts with Paul and Personal. A task added
without a category gets the first one chosen.

Type a task in the box and press Enter. A date or repeat said at the end becomes its date: "tomorrow", "fri", "next
week", "oct 20", "in 3 days", "this weekend", "every weekday", "every monday", "monthly on the 1st". What will be
saved shows under the box as it's typed, and **Keep words** keeps the words as written. `(A)` at the start sets a
priority, and `@` suggests the categories that exist.

Tap a task to open it: its words, notes, date, repeat, priority, categories and steps (subtasks), each changed in
place. **Skip** moves a routine to its next date without marking it done. Every change can be undone from the note
at the bottom, or with Cmd/Ctrl+Z. On a laptop, `n` goes to the add box, `/` searches every task, open or done, `j`
and `k` move between tasks, Enter opens one and `x` marks it done. The lines button at the top opens the whole
todo.txt for editing by hand.

On the Pixel, Chrome's **Install app** puts Godwit on the home screen. Its icon's long-press has **Add task**, and
text or links shared from another app open in the add box.

## The format

Each line is a task, as in [todo.txt](https://github.com/todotxt/todo.txt), and a leading tab makes it a step of
the task above:

```text
(A) 2026-10-13 Look over the camera ready @Paul due:2026-10-15 notes:"Check the figures"
	2026-10-13 Read the reviews @Paul
x 2026-10-14 2026-10-08 5-min journaling @Personal due:2026-10-09 rec:+1b
```

Godwit reads `x` and its date, the priority, the created date, `@contexts`, `due:`, `rec:` and `notes:` (quoted, with
`\n` for new lines). Anything else stays in the task's words as written. `rec:` takes a number and d, b (weekdays),
w, m or y. With a `+` it keeps the schedule: the next date is the first one after today, so missed days are skipped,
not owed. Without it, the next date counts from the day it's done. Done marks a task's open steps done too.

## Sync

The Worker keeps every saved version of the todo.txt in D1 (every version for 30 days, then one a day). Each device
keeps its copy in localStorage and works offline. An edit is sent with the version it was made from; if another
device saved first, the Worker sends its text back, the two are merged line by line, and the result is sent again.
A line only one side changed takes that side; a task both changed differently keeps both versions. Undo uses the
same merge, so it takes back one change and nothing else.

Scripts and agents can use the same file with the password:

```sh
curl -sD - -H "authorization: Bearer $KEY" https://godwit.scottibrain.workers.dev/todo.txt       # the ETag is the version
curl -X PUT -H "authorization: Bearer $KEY" -H 'if-match: "42"' --data-binary @todo.txt https://godwit.scottibrain.workers.dev/todo.txt
```

A PUT is refused with 412 and the current text when the version has moved on. Read it again, redo the change, and
send it with the new version.

## Development

`todo.js` holds the format, dates, repeats, quick-add phrases and the merge; `node --test todo.test.js` checks them.
`.claude/launch.json` at the repo root runs the page (`godwit`, port 8481) and the Worker (`godwit-worker`, port
8790); on localhost the page talks to the local Worker and there's no service worker. The local Worker's password is
a throwaway in `worker/.dev.vars`. The first time, create the table with
`npx wrangler d1 execute godwit --local --file schema.sql` from `worker/`. Two origins, localhost and 127.0.0.1, act
as two devices.

To release, raise `VERSION` in `sw.js`, so installed copies offer **Update**. Deploy the Worker with
`npx wrangler deploy` from `worker/`; its secret `KEY` is the password shared with ebis, myna and paisano.
