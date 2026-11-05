#!/usr/bin/env python3
"""Operator deployment of an exact feature commit to Hubify, without a template release."""
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

sys.path.insert(0, "/opt/single-store/manager")
import core
import updater

def main():
    if os.geteuid() != 0:
        raise RuntimeError("Run through an authorized sudo operator.")
    sha = sys.argv[1]
    if not re.fullmatch("[a-f0-9]{40}", sha):
        raise RuntimeError("Exact commit required.")
    if "APP_ORIGIN=https://hubify.web.id" not in (core.CONFIG / "runtime.env").read_text().splitlines():
        raise RuntimeError("Target is not Hubify.")
    lock = open(core.CONFIG / "hubify-candidate.lock", "w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    source = core.ROOT / "development-sources" / sha
    source.parent.mkdir(mode=0o700, exist_ok=True)
    if not source.exists():
        core.run(["git", "clone", "--no-checkout", "https://github.com/Assyauq26/buattokoonline.git", str(source)], timeout=180)
    core.run(["git", "-C", str(source), "fetch", "origin", sha], timeout=180)
    core.run(["git", "-C", str(source), "checkout", "--detach", sha])
    if core.run(["git", "-C", str(source), "rev-parse", "HEAD"]) != sha:
        raise RuntimeError("Source commit mismatch.")
    installed = core.read_json(core.CONFIG / "version.json")
    if core.inventory(source) != installed["migrations"]:
        raise RuntimeError("Candidate requires a separately reviewed schema migration.")
    old = core.read_json(core.COMPOSE)
    new = copy.deepcopy(old)
    new["services"]["app"]["build"] = {"context": str(source / "app"), "target": "runtime"}
    new["services"]["app"]["image"] = "single-store-app:hubify-candidate-" + sha[:12]
    candidate = source / "compose.candidate.json"
    core.atomic_json(candidate, new)
    print("Building exact candidate " + sha, flush=True)
    core.dc(["build", "app"], file=candidate, timeout=1800)
    print("Build complete. Creating backup.", flush=True)
    backup = updater.backup()
    journal_path = core.CONFIG / "hubify-candidate.json"
    journal = {"sha": sha, "previous": installed, "old_compose": old, "backup": backup, "status": "deploying", "time": int(time.time())}
    core.atomic_json(journal_path, journal)
    try:
        core.atomic_json(core.COMPOSE, new)
        core.dc(["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "90", "app"], timeout=180)
        core.healthy()
        core.public_health(core.read_json(core.STATE))
        core.atomic_json(core.CONFIG / "version.json", {**installed, "source_sha": sha, "channel": "hubify-development"})
        journal["status"] = "complete"
        core.atomic_json(journal_path, journal)
        print("HUBIFY_CANDIDATE_SUCCESS " + sha, flush=True)
    except Exception:
        core.atomic_json(core.COMPOSE, old)
        core.dc(["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "90", "app"], timeout=180)
        core.healthy()
        journal["status"] = "rolled-back"
        core.atomic_json(journal_path, journal)
        raise

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Candidate deployment failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
