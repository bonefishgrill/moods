#!/usr/bin/env python3
"""Report dead or non-embeddable videos in playlists.json.

Every mood button picks from a list of YouTube IDs. Videos get taken down,
made private, or have embedding switched off, and each one becomes a button
that plays nothing. This asks YouTube's oEmbed endpoint about each ID.

    python3 check-videos.py            # human-readable report
    python3 check-videos.py --json     # machine-readable, for scripting

oEmbed is a good first pass, not gospel: it catches removed, private, and
most embedding-disabled videos, but it can't see region blocks (a video fine
from here may fail elsewhere) and it won't catch a video that still exists
but has become something other than what you picked. Exit status is 1 if
anything looks broken, so this can gate a cron job.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

OEMBED = "https://www.youtube.com/oembed"
WORKERS = 12
TIMEOUT = 15
RETRIES = 2


def check(video_id):
    """Return (video_id, status, detail). status: ok | dead | blocked | error."""
    url = OEMBED + "?" + urllib.parse.urlencode(
        {"url": "https://www.youtube.com/watch?v=" + video_id, "format": "json"})
    last = None
    for attempt in range(RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "moods-link-check/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                title = json.load(resp).get("title", "")
                return video_id, "ok", title
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return video_id, "dead", "removed or private"
            if e.code in (401, 403):
                return video_id, "blocked", "embedding disabled"
            if e.code == 429:
                last = "rate limited"
                continue
            return video_id, "error", "HTTP %d" % e.code
        except Exception as e:                      # network, timeout, bad JSON
            last = type(e).__name__
    return video_id, "error", last or "unknown"


def main():
    as_json = "--json" in sys.argv

    with open("playlists.json") as f:
        playlists = json.load(f)

    # id -> the moods that use it, so a dead video points at the buttons it breaks
    where = {}
    for mood, entry in playlists.items():
        for vid in entry.get("videos", []):
            where.setdefault(vid, []).append(mood)

    ids = sorted(where)
    if not as_json:
        print("checking %d unique videos across %d moods...\n" % (len(ids), len(playlists)))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(check, ids))

    broken = [r for r in results if r[1] in ("dead", "blocked")]
    errors = [r for r in results if r[1] == "error"]

    if as_json:
        json.dump({
            "checked": len(ids),
            "broken": [{"id": i, "status": s, "detail": d, "moods": where[i]}
                       for i, s, d in broken],
            "errors": [{"id": i, "detail": d, "moods": where[i]} for i, _, d in errors],
        }, sys.stdout, indent=2)
        print()
        return 1 if broken else 0

    if broken:
        print("BROKEN (%d):" % len(broken))
        for vid, status, detail in broken:
            print("  %-12s %-8s %-22s %s" % (vid, status, detail, ", ".join(where[vid])))
        # per-mood damage, since one dead video matters more in a short playlist
        print("\nby mood:")
        for mood, entry in playlists.items():
            total = len(entry.get("videos", []))
            hit = sum(1 for vid, _, _ in broken if mood in where[vid])
            if hit:
                print("  %-16s %d of %d dead" % (mood, hit, total))
    else:
        print("no dead videos.")

    if errors:
        print("\ncouldn't check %d (network trouble, try again):" % len(errors))
        for vid, _, detail in errors:
            print("  %-12s %s" % (vid, detail))

    print("\n%d ok, %d broken, %d unchecked" %
          (len(ids) - len(broken) - len(errors), len(broken), len(errors)))
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
