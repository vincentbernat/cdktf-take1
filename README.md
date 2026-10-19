# Musings around CDKTF / CDK Terrain

This is my first tentative to use [CDKTF][]/[CDKTN][CDK Terrain] to manage my
personal infrastructure. This is an exploration to let me become more familiar
with it. Servers are then managed using <del>NixOps</del><ins>Colmena</ins>.
Check my [nixops-take1][] repository for this part.

[nixops-take1]: https://github.com/vincentbernat/nixops-take1
[CDKTF]: https://developer.hashicorp.com/terraform/cdktf
[CDK Terrain]: https://cdktn.io

## Interaction with NixOps

When there is a change, the stack output should be exported to NixOps:

```console
$ cd cdktf.out/stacks/cdktf-take1
$ tofu output -json > ~-automation/nixops-take1/cdktf.json
```

## Various commands

### Shell

Use `nix develop -c $SHELL` to enter the appropriate environment. You
need to have Flakes support for this to work.

### Deploy

The `deploy` command, available in the shell, runs `cdktn synth`, the tests,
`tofu init` and `tofu plan`. It asks for a confirmation before applying the
plan, then exports the outputs to `../nixops-take1/cdktf.json`. Arguments are
given to `tofu plan`:

```console
$ deploy
$ deploy --refresh=false
```

### CDKTF

These are the commands specific to [CDK Terrain][], the community fork of CDKTF.

```console
$ cdktn synth && npm test
$ cdktn diff
$ cdktn deploy
```

Alternatively, one may only use `cdktn synth`, then switch to OpenTofu commands
(they are far more flexible):

```console
$ cd cdktf.out/stacks/cdktf-take1
$ rm -f .terraform.lock.hcl && tofu init
$ tofu plan --out plan
$ tofu plan --out plan --refresh=false
$ tofu apply plan
$ tofu output -json > ~-automation/nixops-take1/cdktf.json
```

Notably, one can import resources this way:

```console
$ tofu state list
$ tofu show --json plan | jq -r '.planned_values.root_module.resources[].address'
$ tofu import aws_cloudfront_distribution.cdktftake1_mediabernatch_1FD37B2F E1KREAZ6F4767X
```

To get the resources from Pulumi, one can use:

```console
$ cat .pulumi/stacks/dev.json | jq -r '.checkpoint.latest.resources[] | (.urn + " → " + .id)' | grep rdns
```

### npm (for JavaScript dependencies)

```console
$ npm outdated
$ npm update --package-lock-only --ignore-scripts
$ npm install --package-lock-only --ignore-scripts typescript@latest
```

### Nix

Update nixpkgs:

```console
$ nix flake update nixpkgs
```

## Todo

### Move away from CloudFront and Route53

- [x] Add Bunny DNS as a backup for `bernat.ch` and `bernat.im`
- [x] Serve `media.bernat.ch` and `media.une-oasis-une-ecole.fr` with Bunny CDN
- [x] Switch `bernat.im` to Bunny (keep Route53 as backup)
- [x] Run Hickory DNS on servers tagged `dns` (web04), with `y.luffy.cx` and
      `acme.luffy.cx` signed with DNSSEC and accepting TSIG updates
- [x] Publish the DS of Hickory keys next to the Route53 ones
- [x] Delegate `y.luffy.cx` to web04 and add `nsupdate.luffy.cx`
- [x] Switch the DDNS clients to TSIG updates
- [x] Delegate `acme.luffy.cx` to web04
- [x] Switch ACME DNS-01 challenges to `dnsupdate`
- [ ] After 2026-10-18 20:00 UTC (Route53 NS TTL), remove the Route53 DS for
      `y` and `acme`, the Route53 zones, the `DDNS` and `ACME` IAM users and
      the `acme-zone` output
- [x] Switch `vincentbernat.com` to Bunny as a test, with the Gandi KSK
      (16320) next to the Bunny one (33331)
- [x] After 2026-10-18 21:00 UTC (`.com` NS TTL), remove `.registrarKey()` on
      the Gandi zone for `vincentbernat.com`
- [x] Switch `bernat.ch` to Bunny:
  - [x] Report to Bunny the denial of existence for script records: on names
        other than the apex, the NSEC record includes CNAME, so validating
        resolvers reject NODATA answers (`HTTPS` and `TXT` queries fail).
        Example: `dig HTTPS www.vincentbernat.com @1.1.1.1` returns SERVFAIL.
        In the meantime, I've added an explicit HTTPS record.
  - [x] Remove the DS at Gandi with `.registrar(providers.gandiVB, false)` on
        the Route53 zone and stop signing the Bunny zone (remove `.sign()`, so
        it does not publish CDS records), wait 1 hour (DS TTL in `.ch`). The
        domain is unsigned until the last step.
  - [x] Switch nameservers to Bunny at Gandi: move
        `.registrar(providers.gandiVB, false)` to the Bunny zone
  - [x] After 2026-10-19 8:40 UTC (Route53 NS TTL), sign the Bunny zone and
        publish its KSK with `.sign().registrar(providers.gandiVB)`.
- [ ] Remove the CloudFront distributions
- [ ] Remove the Route53 zones for `bernat.ch` and `bernat.im`
- [ ] Remove the AWS provider, with the KMS key and alias used to sign the
      Route53 zones (AWS deletes a KMS key after 7 to 30 days)
- [ ] Serve the Bunny CDN as `media-cdn.bernat.ch`: add it as a hostname of
      the pull zone (with TLS), use a CNAME to `media-bernat-ch.b-cdn.net`
      while `bernat.ch` is on Route53, then a `PullZone` record once it is on
      Bunny (answered directly, no CNAME to follow).
