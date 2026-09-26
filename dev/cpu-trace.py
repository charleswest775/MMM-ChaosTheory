# CPU of MagicMirror's Electron processes plus the cage compositor, in % of one core, every
# `step` seconds for `dur` seconds, as "t cpu" lines: what a page costs, second by second.
# Run on the Pi:  scp dev/cpu-trace.py pi:/tmp/ && ssh pi 'python3 /tmp/cpu-trace.py 265 0.25' > trace.txt
# MMM-pages' timings are fixed, so once one page change is found in the trace (a jump after a
# resting page), the others follow; average the pages second by second from their changes.
# Per-process deltas, so processes starting or ending (Chromium's helpers) don't show as spikes.
import os, sys, time
dur, step = float(sys.argv[1]), float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
hz = os.sysconf("SC_CLK_TCK")

def pids():
    out = []
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            if b"MagicMirror/node_modules/electron/dist/electron" in open(f"/proc/{d}/cmdline", "rb").read() \
                    or open(f"/proc/{d}/comm").read().strip() == "cage":
                out.append(d)
        except OSError:
            pass
    return out

def ticks(ps):
    t = {}
    for p in ps:
        try:
            s = open(f"/proc/{p}/stat").read()
            f = s[s.rindex(")") + 2:].split()
            t[p] = int(f[11]) + int(f[12])
        except OSError:
            pass
    return t

ps = pids()
t0 = prevt = time.monotonic()
prev = ticks(ps)
n = 0
while prevt - t0 < dur:
    n += 1
    time.sleep(max(0, t0 + n * step - time.monotonic()))
    if n % 40 == 0:
        ps = pids()
    now, cur = time.monotonic(), ticks(ps)
    used = sum(v - prev[p] for p, v in cur.items() if p in prev)
    print(f"{now - t0:.2f} {used / hz / (now - prevt) * 100:.0f}", flush=True)
    prev, prevt = cur, now
