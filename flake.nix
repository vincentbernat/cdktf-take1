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
        poetry = pkgs.poetry2nix.mkPoetryPackages {
          projectDir = ./.;
          overrides = pkgs.poetry2nix.overrides.withDefaults (self: super: {
            exceptiongroup = super.exceptiongroup.overridePythonAttrs (old: {
              nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ self.flit-scm ];
            });
          } // (l.listToAttrs (l.map
            # Many dependencies need setuptools. Should be global...
            (x: {
              name = x;
              value = super."${x}".overridePythonAttrs (old: {
                nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ self.setuptools ];
              });
            })
            [ "jsii" "constructs" "cdktf" "cdktf-cdktf-provider-aws" ]))
          );
        };
        nodeEnv = pkgs.mkYarnModules {
          pname = "cdktf-take1-js-modules";
          version = "1.0.0";
          packageJSON = ./package.json;
          yarnLock = ./yarn.lock;
        };
        pythonEnv = poetry.python.withPackages (ps: poetry.poetryPackages ++ [
          ps.pip
          ps.setuptools
          ps.black
        ]);
      in
      {
        apps = {
          yarn = {
            type = "app";
            program = "${pkgs.yarn}/bin/yarn";
          };
          poetry = {
            type = "app";
            program = "${pkgs.poetry}/bin/poetry";
          };
        };
        devShell = pythonEnv.env.overrideAttrs (oldAttrs: {
          name = "cdktf-take1";
          buildInputs = [
            pkgs.terraform
          ];
          shellHook = ''
            export CHECKPOINT_DISABLE=1
            export PATH=$PWD/node_modules/.bin:$PATH
            ln -nsf ${nodeEnv}/node_modules node_modules
          '';
        });
      });
}
