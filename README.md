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
$ cdktf output --json > ~-automation/nixops-take1/cdktf.json
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

Alternatively, one may only use `cdktf synth`, then switch to Terraform commands:

```console
$ cd cdktf.out/stacks/cdktf-take1
$ terraform plan
$ terraform apply
```

Notably, one can import resources this way:

```console
$ terraform state list
$ terraform show --json plan | jq -r '.planned_values.root_module.resources[].address'
$ terraform import aws_cloudfront_distribution.cdktftake1_mediabernatch_1FD37B2F E1KREAZ6F4767X
```

To get the resources from Pulumi, one can use:

```console
$ cat .pulumi/stacks/dev.json | jq -r '.checkpoint.latest.resources[] | (.urn + " → " + .id)' | grep rdns
```

To export outputs to NixOps, use:

```console
$ cd cdktf.out/stacks/cdktf-take1
$ terraform output -json > ~-automation/nixops-take1/terraform.json
```

### Yarn (for JavaScript dependencies)

```console
$ yarn outdated
$ yarn install --modules-folder ~/tmp/node_modules --ignore-scripts
$ yarn upgrade-interactive --modules-folder ~/tmp/node_modules --ignore-scripts --latest
```

### Nix

Update nixpkgs:

```console
$ nix flake lock --update-input nixpkgs
```
