# Keep Awake

Keep the Mac awake with the lid closed, indefinitely or for a fixed duration.

| Command | Description |
| --- | --- |
| Keep Awake | Show the state and switch it, with timer presets |

## Driving it from a script

The command takes one optional argument — `on`, `off`, `30m`, `3h` — so a deeplink can switch the state with no interaction. Leave it empty to just open the UI.

```bash
open 'raycast://extensions/uphy/keep-awake/keep-awake?arguments=%7B%22state%22%3A%22on%22%7D'
```

`arguments` is URL-encoded JSON: `{"state":"on"}`. Do **not** add `launchType=background` — a `view` command is not executed at all when it is set. Without it the window opens without taking focus, and the command closes it once the change is applied.

`open` is fire-and-forget and reports neither completion nor failure, so anything that must not silently fail should check the resulting state itself.

## Requirements

Needs passwordless `sudo` for the two `pmset` invocations it makes. Set it up once with `sudo visudo -f /etc/sudoers.d/pmset-disablesleep`:

```
<username> ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1
```
