# Musings around CDKTF

This is my first tentative to use [CDKTF][] to manage my personal
infrastructure. This is an exploration to let me become more familiar
with it. Servers are then managed using NixOps. Check my
[nixops-take1][] repository for this part.

[nixops-take1]: https://github.com/vincentbernat/nixops-take1
[CDKTF]: https://developer.hashicorp.com/terraform/cdktf

## Interaction with NixOps

When there is a change, the stack output should be exported to NixOps:

```
cdktf output --json > ~-automation/nixops-take1/cdktf.json
```

## Various commands

### Shell

Use `nix develop -c $SHELL` to enter the appropriate environment. You
need to have Flakes support for this to work.

### CDKTF

```
cdktf synth
cdktf diff
cdktf deploy
```

### Poetry (for Python dependencies)

Check oudated dependencies:

```
nix run .#poetry -- show --outdated
```

Update a dependency:

```
nix run .#poetry -- update --lock langcodes
```

### Yarn (for JavaScript dependencies)

Check oudated dependencies:

```
nix run .#yarn -- outdated
```

Upgrade a dependency:

```
nix run .#yarn -- upgrade-interactive --modules-folder ~/tmp/node_modules --ignore-scripts --latest
```

### Nix

Update nixpkgs:

```
nix flake lock --update-input nixpkgs
```
