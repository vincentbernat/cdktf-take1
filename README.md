# Musings around CDKTF

This is my first tentative to use [CDKTF][] to manage my personal
infrastructure. This is an exploration to let me become more familiar
with it. Servers are then managed using NixOps. Check my
[nixops-take1][] repository for this part.

[nixops-take1]: https://github.com/vincentbernat/nixops-take1
[CDKTF]: https://developer.hashicorp.com/terraform/cdktf

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

### CDKTF

These are the commands specific to CDKTF.

```console
$ cdktf synth
$ cdktf diff
$ cdktf deploy
```

Alternatively, one may only use `cdktf synth`, then switch to OpenTofu commands
(they are far more flexible):

```console
$ cd cdktf.out/stacks/cdktf-take1
$ tofu init --upgrade
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
