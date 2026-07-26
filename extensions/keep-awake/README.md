# Keep Awake

Keep the Mac awake with the lid closed, indefinitely or for a fixed duration.

Needs passwordless `sudo` for the two `pmset` invocations it makes. Set it up once with `sudo visudo -f /etc/sudoers.d/pmset-disablesleep`:

```
<username> ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1
```
