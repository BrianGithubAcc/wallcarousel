{
  description = "WallCarousel - lightweight wallpaper tray application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            pnpm

            rustc
            cargo
            rust-analyzer
            clippy
            rustfmt

            pkg-config
            openssl

            gtk3
            glib
            webkitgtk_4_1
            librsvg
            libsoup_3
          ];

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.gtk3
              pkgs.glib
              pkgs.webkitgtk_4_1
              pkgs.librsvg
              pkgs.libsoup_3
              pkgs.openssl
            ]}:$LD_LIBRARY_PATH"

            echo "WallCarousel development environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "Rust: $(rustc --version)"
          '';
        };
      }
    );
}
