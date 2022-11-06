{
  inputs = {
    nixpkgs.url = "nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, flake-utils, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = inputs.nixpkgs.legacyPackages."${system}";
        l = pkgs.lib // builtins;
        nodeEnv = pkgs.mkYarnModules {
          pname = "cdktf-take1-js-modules";
          version = "1.0.0";
          packageJSON = ./package.json;
          yarnLock = ./yarn.lock;
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
            pkgs.yarn
            pkgs.terraform
          ];
          shellHook = ''
            export CHECKPOINT_DISABLE=1
            export PATH=$PWD/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules
          '';
        };
      });
}
