#!/usr/bin/env python3
"""Compare the records of a zone between Gandi and Bunny DNS.

For names using a script on Bunny, A and AAAA records only need to be a
subset of each other."""

import json
import re
import subprocess
import sys

CONFIG = "cdktf.out/stacks/cdktf-take1/cdk.tf.json"
SERVERS = {"gandi": "ns1.gandi.net", "bunny": "kiki.bunny.net"}


def fqdn(name, zone):
    return zone if name in ("@", "") else f"{name}.{zone}"


def wanted(zone):
    """Return the (name, type) pairs to check and the names using a script."""
    resources = json.load(open(CONFIG))["resource"]
    pairs = set()
    for r in resources.get("gandi_livedns_record", {}).values():
        if r["zone"] == zone:
            pairs.add((fqdn(r["name"], zone), r["type"]))
    zones = {
        f"${{bunnynet_dns_zone.{k}.id}}"
        for k, z in resources.get("bunnynet_dns_zone", {}).items()
        if z["domain"] == zone
    }
    scripted = set()
    for r in resources.get("bunnynet_dns_record", {}).values():
        if r["zone"] not in zones:
            continue
        name = fqdn(r["name"], zone)
        if r["type"] == "Script":
            scripted.add(name)
        else:
            pairs.add((name, r["type"]))
    return pairs, scripted


def query(server, name, rrtype):
    out = subprocess.run(
        ["dig", "+short", "+norec", f"@{server}", name, rrtype],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    answers = []
    for line in out.splitlines():
        line = line.strip().lower().rstrip(".")
        if rrtype == "TXT":
            line = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', line))
        answers.append(line)
    return sorted(answers)


def main():
    zone = sys.argv[1] if len(sys.argv) > 1 else "bernat.ch"
    pairs, scripted = wanted(zone)
    differences = 0
    for name in scripted:
        pairs |= {(name, "A"), (name, "AAAA")}
    for name, rrtype in sorted(pairs):
        results = {k: query(s, name, rrtype) for k, s in SERVERS.items()}
        gandi, bunny = set(results["gandi"]), set(results["bunny"])
        if name in scripted and rrtype in ("A", "AAAA"):
            # Bunny only returns the closest servers
            same = bunny and (gandi <= bunny or bunny <= gandi)
        else:
            same = results["gandi"] == results["bunny"]
        if not same:
            differences += 1
            print(f"{name} {rrtype}")
            for k, v in results.items():
                print(f"  {k}: {v}")
    print(f"{len(pairs)} records checked, {differences} differences")
    return 1 if differences else 0


if __name__ == "__main__":
    sys.exit(main())
