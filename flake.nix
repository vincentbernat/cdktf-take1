{
  inputs = {
    nixpkgs.url = "nixpkgs";
    nix-filter.url = "github:numtide/nix-filter";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nix-filter, flake-utils, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        l = pkgs.lib // builtins;
        pkgs = inputs.nixpkgs.legacyPackages."${system}";
        nodeEnv = pkgs.mkYarnModules {
          pname = "cdktf-take1-js-modules";
          version = "1.0.0";
          packageJSON = ./package.json;
          yarnLock = ./yarn.lock;
        };
        terraform = pkgs.terraform.withPlugins (p: [
          p.aws
          p.hcloud
          p.vultr
          p.gandi
        ]);
        cdktfProviders = pkgs.stdenvNoCC.mkDerivation {
          name = "cdktf-providers";
          nativeBuildInputs = [
            pkgs.nodejs
            terraform
          ];
          src = (import nix-filter) {
            root = ./.;
            include = [ ./cdktf.json ./tsconfig.json ];
          };
          phases = [ "unpackPhase" "buildPhase" "installPhase" "fixupPhase" ];
          buildPhase = ''
            # Make the environment looks like a cdktf project
            #export CDKTF_LOG_LEVEL=debug
            export CHECKPOINT_DISABLE=1
            export DISABLE_VERSION_CHECK=1
            export PATH=${nodeEnv}/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules

            # Build all providers we have in terraform
            for provider in $(cd ${terraform}/libexec/terraform-providers; echo */*/*/*); do
              version=''${provider##*/}
              provider=''${provider%/*}
              echo "Build $provider@$version"
              cdktf provider add --force-local $provider@$version | cat
            done
            echo "Compile TS → JS"
            tsc
          '';
          installPhase = ''
            mv .gen $out
            ln -nsf ${nodeEnv}/node_modules $out/node_modules
          '';
        };
      in
      {
        apps = {
          yarn = {
            type = "app";
            program = "${pkgs.yarn}/bin/yarn";
          };
        };
        devShell = pkgs.mkShell {
          name = "cdktf-take1";
          buildInputs = [
            pkgs.nodejs
            pkgs.yarn
            terraform
          ];
          shellHook = ''
            # No telemetry
            export CHECKPOINT_DISABLE=1
            # No autoinstall of plugins
            export CDKTF_DISABLE_PLUGIN_CACHE_ENV=1
            # Do not check version
            export DISABLE_VERSION_CHECK=1
            # Access to node modules
            export PATH=$PWD/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules
            ln -nsf ${cdktfProviders} .gen

            # Credentials
            for p in \
              njf.nznmba.pbz/Nqzvavfgengbe \
              urgmare.pbz/ivaprag@oreang.pu \
              ihyge.pbz/ihyge@ivaprag.oreang.pu; do
                eval $(pass show personal/$(echo $p | tr 'A-Za-z' 'N-ZA-Mn-za-m') | grep '^export')
            done
          '';
        };
      });
}
