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
- [x] After 2026-10-18 20:00 UTC (Route53 NS TTL), remove the Route53 DS for
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
- [x] Remove the CloudFront distributions
- [x] Remove the Route53 zones for `bernat.ch` and `bernat.im`
- [x] Remove the AWS provider, with the KMS key and alias used to sign the
      Route53 zones (AWS deletes a KMS key after 7 to 30 days)

### Move away from Gandi

Gandi was pretty cheap but became [super
expensive](https://www.gandi.net/en/domain/tld) since they got bought in 2024. I
am looking for another registrar. It needs at minimum an API, better a Terraform
provider (but I can write one), with the ability to set/get nameservers for a
domain, as well as to publish a DS record. I would prefer an European registrar.

Based on that, alternatives are:

- [Scaleway](https://www.scaleway.com/en/pricing/domains/)
- [OVHcloud](https://www.ovhcloud.com/fr/domains/tld/)
- [INWX](https://www.inwx.de/en/domain/pricelist)
- [Infomaniak](https://www.infomaniak.com/en/domains/prices)
- [Openprovider](https://www.openprovider.com/domains/domain-prices)
- [Netim](https://www.netim.com/en/domain-name/extensions-list)
- [Joker.com](https://joker.com/domain/prices)

#### Support

| Provider     | API                        | Terraform                   |
|--------------|----------------------------|-----------------------------|
| Gandi        | [Yes][gandi-api]           | [Yes][gandi-tf]             |
| Scaleway     | [Yes][scaleway-api]        | [Partial][scaleway-tf]¹     |
| OVHcloud     | [Yes][ovh-api]             | [Yes][ovh-tf]               |
| INWX         | [Yes][inwx-api]            | [Yes][inwx-tf]              |
| Infomaniak   | [Partial][infomaniak-api]² | [No][infomaniak-tf]         |
| Openprovider | [Yes][openprovider-api]    | [Partial][openprovider-tf]³ |
| Netim        | [Yes][netim-api]           | No                          |
| Joker.com    | [Partial][joker-api]⁴      | No                          |

- ¹ Nameservers are read-only and DNSSEC only works with Scaleway nameservers.
- ² Nameservers cannot be read back.
- ³ Community provider. Reading back nameservers and DNSSEC keys is not verified.
- ⁴ DS records cannot be read back.

[gandi-api]: https://api.gandi.net/docs/domains/
[gandi-tf]: https://github.com/go-gandi/terraform-provider-gandi
[scaleway-api]: https://www.scaleway.com/en/developers/api/domains-and-dns/
[scaleway-tf]: https://github.com/scaleway/terraform-provider-scaleway
[ovh-api]: https://eu.api.ovh.com/console/
[ovh-tf]: https://github.com/ovh/terraform-provider-ovh
[inwx-api]: https://www.inwx.com/en/help/apidoc
[inwx-tf]: https://github.com/inwx/terraform-provider-inwx
[infomaniak-api]: https://developer.infomaniak.com/docs/api
[infomaniak-tf]: https://github.com/Infomaniak/terraform-provider-infomaniak
[openprovider-api]: https://developer.openprovider.com/
[openprovider-tf]: https://github.com/charpand/terraform-provider-openprovider
[netim-api]: https://support.netim.com/en/docs/api-rest-3-0
[joker-api]: https://dmapi.joker.com/docs/DMAPI-ext.txt

For Openprovider, Netim and Joker.com, API access needs a (free) reseller
account. Netim needs an approval from their sales team.

#### Pricing

Renewal price for one year, in EUR, without VAT.

| Domain                 | Gandi  | Scaleway | OVHcloud | INWX   | Infomaniak | Openprovider | Netim  | Joker.com |
|------------------------|--------|----------|----------|--------|------------|--------------|--------|-----------|
| vincentbernat.com      | 31.98  | 12.34    | 14.29    | 14.60  | 11.40      | 15.99        | 16.00  | 16.32     |
| luffy.cx               | 100.00 | —        | 62.99    | 52.43  | —          | 39.55        | 38.00  | 24.97     |
| enx.io                 | 64.99  | 98.89    | 59.79    | 69.50  | 52.10      | 84.73        | 60.00  | 81.96     |
| enxio.fr               | 23.98  | 6.59     | 7.79     | 11.00  | 7.00       | 6.95         | 12.00  | 13.00     |
| une-oasis-une-ecole.fr | 23.98  | 6.59     | 7.79     | 11.00  | 7.00       | 6.95         | 12.00  | 13.00     |
| le-val-insolite.fr     | 23.98  | 6.59     | 7.79     | 11.00  | 7.00       | 6.95         | 12.00  | 13.00     |
| bernat.ch              | 31.98  | 25.57    | 12.99    | 13.50  | 9.90       | 24.99        | 12.00  | 10.58     |
| bernat.im              | 31.98  | 38.17    | 14.99    | 33.53  | 29.40      | 57.73        | 20.00  | 16.59     |
|------------------------|--------|----------|----------|--------|------------|--------------|--------|-----------|
| Total                  | 332.87 | 194.74⁵  | 188.42   | 216.56 | 123.80⁵    | 243.84       | 182.00 | 189.42    |

- ⁵ Without `.cx`, not available.
