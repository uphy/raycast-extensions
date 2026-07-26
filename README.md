# raycast-extensions

Personal [Raycast](https://raycast.com) extensions. They are not published to the Raycast Store — building one installs it straight into the local Raycast app.

[![CI](https://github.com/uphy/raycast-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/uphy/raycast-extensions/actions/workflows/ci.yml)

## Extensions

### ghq

Work with repositories managed by [ghq](https://github.com/x-motemen/ghq).

| Command | Description |
| --- | --- |
| Search Repositories | Search cloned repositories, then copy a path, create a Quicklink, or drill into one |
| Open Repository | Open one repository by path — takes an argument, so it works from a Quicklink or a deeplink |
| Clone Repository | `ghq get` a URL and open the result |

Picking a repository opens it in Cursor, VS Code or IntelliJ IDEA, on its web page, in Finder, or shows its pull requests — searchable, with queries you can save.

Needs `ghq`, `git`, the CLI of whichever editor you use (`cursor`, `code`, `idea`), and `gh` for the pull request list. Raycast does not inherit a login shell's `PATH`, so set the extension's **PATH** preference to the directories those live in.

### Keep Awake

Keeps the Mac awake with the lid closed, indefinitely or until a timer runs out.

| Command | Description |
| --- | --- |
| Keep Awake | Show whether the Mac is being kept awake, and turn it on or off with an optional timer |

Two things have to hold for a closed lid not to sleep, and the command reports both: `pmset disablesleep` and a running `caffeinate -d -i -s`. If only one of them is up, it says so and offers to converge on the ON side — drifting to OFF would put the machine to sleep inside a closed lid.

The command also takes an optional `on` / `off` / `30m` / `3h` argument, so a deeplink switches the state with no interaction and no second command. That is how [raycast-script-commands](https://github.com/uphy/raycast-script-commands) drives it instead of keeping its own copy of the logic:

```bash
open 'raycast://extensions/uphy/keep-awake/keep-awake?arguments=%7B%22state%22%3A%22on%22%7D'
```

A timer is enforced by `caffeinate -t` itself, which then resets `disablesleep` as it exits. Nothing needs to be running for the deadline to hold: background refresh is only available to `no-view` and `menu-bar` commands, and macOS shifts its schedule on battery, so it cannot be trusted with a deadline.

Needs passwordless `sudo` for the two `pmset` invocations. Set it up once with `sudo visudo -f /etc/sudoers.d/pmset-disablesleep`:

```
<username> ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1
```

`caffeinate -s` only takes effect on AC power, so the command flags battery operation rather than pretending it worked. Timer presets are configurable through the **Timer Presets** preference.

### Obsidian Reminder

Lists the reminders held by [obsidian-reminder-plugin](https://github.com/uphy/obsidian-reminder), grouped by due date: Overdue, Today, Tomorrow, In a week, In a month and Over 1 month. Read-only — it parses Obsidian's `obsidian.json` and the plugin's `data.json` and never writes to them.

| Command | Description |
| --- | --- |
| Search Reminder | Search reminders across every local vault |

### Slack Operator

Drives the Slack desktop app by sending it keystrokes over AppleScript, so Raycast can jump to a Slack view directly.

| Command | Sends |
| --- | --- |
| Open Unreads | `⌘⇧A` |
| Open Threads | `⌘⇧T` |
| Switch to Channel | `⌘K` |

Needs the Slack desktop app and macOS accessibility permission for Raycast (System Settings → Privacy & Security → Accessibility); without it the commands fail silently. If Slack is slow to focus and keystrokes get dropped, raise the **Slack Launch Wait** preference.

## Development

Requires [mise](https://mise.jdx.dev) and Node.js.

```bash
mise run install   # install dependencies and enable the git hooks
mise run check     # lint, type-check and build — what CI runs
mise run build     # build every extension = deploy it to Raycast
```

**Building is deploying.** `ray build` defaults to `-e dev`, and that environment's output directory is `~/.config/raycast/extensions/`, so a successful build installs the extension. There is no "built but not deployed" state. Use `mise run build-dist` to verify a build without touching the app, and restart Raycast if a change does not show up.

A brand-new extension is the one exception: `ray build` writes the bundle, but Raycast will not list it until `npm run dev` has run once and registered it. The registration outlives the dev process, so this is a one-time step — after that, building is enough.

Each `extensions/<name>/` is a standalone npm project — there is no root `package.json` and this is not a workspace. `mise` tasks loop over all of them; scope a task with `EXTENSIONS="ghq" mise run lint`. To work on a single extension directly:

```bash
cd extensions/ghq
npm run dev        # ray develop, with hot reload
npm run typecheck
```

## Quality checks

Three layers, all running the same underlying tools:

- **pre-commit hook** — Prettier, ESLint and `tsc` over any extension with staged changes. Enabled by `mise run install`, bypass with `git commit --no-verify`
- **CI** — shellcheck and `mise run check` on every push and pull request
- **`mise run check`** — `ray lint` (manifest, icons, ESLint, Prettier), `tsc --noEmit`, and a distribution build

`ray lint` validates the manifest `author` against the Raycast Store API, so it needs network access. That is why the pre-commit hook runs ESLint and Prettier directly instead — it should not block a commit made offline.

There are no tests. See [CLAUDE.md](CLAUDE.md) for the architecture and the sharper edges.
