{
  inputs = {
    nixpkgs.url = "nixpkgs";
    nix-filter.url = "github:numtide/nix-filter";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, flake-utils, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import inputs.nixpkgs
          {
            inherit system;
          };
        nodejs = pkgs.nodejs;
        nix-filter = inputs.nix-filter.lib;
        nodeEnv = pkgs.importNpmLock.buildNodeModules {
          package = pkgs.lib.importJSON ./package.json;
          packageLock = pkgs.lib.importJSON ./package-lock.json;
          inherit nodejs;
          derivationArgs.npmRebuildFlags = "--ignore-scripts";
        };
        tofu = pkgs.opentofu.withPlugins (p: [
          p.hashicorp_aws
          p.hetznercloud_hcloud
          p.vultr_vultr
          # Fork with the livedns_key resource
          (p.go-gandi_gandi.override {
            owner = "vincentbernat";
            repo = "terraform-provider-gandi";
            rev = "feature/livedns-key";
            version = "2.2.0";
            hash = "sha256-XNKMqVQ/tVG2OHyuBtBdrrZa4jFzCw8a5WLKELuqKkw=";
            vendorHash = "sha256-uWTY8cFztXFrQQ7GW6/R+x9M6vHmsb934ldq+oeW5vk=";
          })
        ]);
        cdktfProviders = pkgs.stdenvNoCC.mkDerivation {
          name = "cdktf-providers";
          nativeBuildInputs = [
            nodejs
            tofu
          ];
          src = nix-filter {
            root = ./.;
            include = [ ./cdktf.json ./tsconfig.json ];
          };
          buildPhase = ''
            # Make the environment looks like a cdktf project
            #export CDKTF_LOG_LEVEL=debug
            export HOME=$(mktemp -d)
            export CHECKPOINT_DISABLE=1
            export DISABLE_VERSION_CHECK=1
            export TERRAFORM_BINARY_NAME=tofu
            export PATH=${nodeEnv}/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules

            # Build all providers we have in OpenTofu
            for provider in $(cd ${tofu}/libexec/terraform-providers; echo */*/*/*); do
              version=''${provider##*/}
              provider=''${provider%/*}
              echo "Build $provider@$version"
              cdktn provider add --force-local $provider@$version | cat
            done
            echo "Compile TS → JS"
            # The AWS provider needs a lot of memory
            NODE_OPTIONS=--max-old-space-size=8192 tsc
          '';
          installPhase = ''
            mv .gen $out
            ln -nsf ${nodeEnv}/node_modules $out/node_modules
          '';
        };
      in
      {
        apps = {
          npm = {
            type = "app";
            program = "${nodejs}/bin/npm";
          };
        };
        devShells.default = pkgs.mkShell {
          name = "cdktf-take1";
          buildInputs = [
            nodejs
            tofu
          ];
          shellHook = ''
            # No telemetry
            export CHECKPOINT_DISABLE=1
            # No autoinstall of plugins
            export CDKTF_DISABLE_PLUGIN_CACHE_ENV=1
            # Do not check version
            export DISABLE_VERSION_CHECK=1
            # Use OpenTofu instead of Terraform
            export TERRAFORM_BINARY_NAME=tofu
            # Access to node modules
            export PATH=$PWD/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules
            ln -nsf ${cdktfProviders} .gen

            # Credentials
            [ "$TERM" = dumb ] || {
              for p in \
                njf.nznmba.pbz/Nqzvavfgengbe \
                urgmare.pbz/ivaprag@oreang.pu \
                ihyge.pbz/ihyge@ivaprag.oreang.pu; do
                  eval $(pass show personal/$(echo $p | tr 'A-Za-z' 'N-ZA-Mn-za-m') | grep '^export')
              done
              eval $(pass show personal/cdktf/secrets | grep '^export')
              export TF_VAR_hcloudToken="$HCLOUD_TOKEN"
              export TF_VAR_vultrApiKey="$VULTR_API_KEY"
              unset VULTR_API_KEY HCLOUD_TOKEN
            }
          '';
        };
      });
}
