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

        runtimePath = pkgs.lib.makeBinPath [ pkgs.awww ];
        runtimeLibraryPath = pkgs.lib.makeLibraryPath [
          pkgs.gtk-layer-shell
          pkgs.libayatana-appindicator
          pkgs.libappindicator-gtk3
        ];

        wallcarousel = pkgs.rustPlatform.buildRustPackage {
          pname = "wallcarousel";
          version = "0.1.0";
          src = pkgs.lib.cleanSource ./.;

          cargoRoot = "src-tauri";
          buildAndTestSubdir = "src-tauri";
          buildFeatures = [ "tauri/custom-protocol" ];
          cargoLock.lockFile = ./src-tauri/Cargo.lock;
          CI = "true";

          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "wallcarousel-frontend";
            version = "0.1.0";
            src = pkgs.lib.cleanSource ./.;
            fetcherVersion = 4;
            hash = "sha256-7aak4ehpIdA7bWE1l6iWJGVhYxOHGqoQPmkwN1BfA1U=";
          };

          nativeBuildInputs = with pkgs; [
            pkg-config
            nodejs
            pnpm
            pnpmConfigHook
            makeWrapper
          ];

          buildInputs = with pkgs; [
            gtk3
            gtk-layer-shell
            webkitgtk_4_1
            libsoup_3
            libayatana-appindicator
            libappindicator-gtk3
            gdk-pixbuf
          ];

          preBuild = ''
            pnpm build
          '';

          postInstall = ''
            mv $out/bin/app $out/bin/wallcarousel
            wrapProgram $out/bin/wallcarousel \
              --prefix PATH : ${runtimePath} \
              --prefix LD_LIBRARY_PATH : ${runtimeLibraryPath} \
              --prefix XDG_DATA_DIRS : ${pkgs.gsettings-desktop-schemas}/share:${pkgs.gtk3}/share \
              --run 'if [ "''${XDG_SESSION_TYPE:-}" = "wayland" ] && { [ -e /sys/module/nvidia_drm ] || [ -e /proc/driver/nvidia/version ]; } && [ -z "''${__NV_DISABLE_EXPLICIT_SYNC+x}" ]; then export __NV_DISABLE_EXPLICIT_SYNC=1; fi'

            install -Dm644 src-tauri/icons/wall_icon.png \
              $out/share/icons/hicolor/64x64/apps/wallcarousel.png
            install -Dm644 /dev/stdin $out/share/applications/wallcarousel.desktop <<EOF
            [Desktop Entry]
            Type=Application
            Name=Wallcarousel
            Comment=Wallpaper library and carousel
            Exec=wallcarousel
            Icon=wallcarousel
            Terminal=false
            Categories=Utility;Graphics;
            EOF
          '';

          meta = {
            description = "Wallpaper library and desktop carousel";
            mainProgram = "wallcarousel";
            platforms = pkgs.lib.platforms.linux;
          };
        };
      in
      {
        packages = {
          default = wallcarousel;
          inherit wallcarousel;
        };

        apps.default = flake-utils.lib.mkApp { drv = wallcarousel; };

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
            gtk-layer-shell
            glib
            webkitgtk_4_1
            librsvg
            libsoup_3
            libayatana-appindicator

            awww
          ];

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.gtk3
              pkgs.gtk-layer-shell
              pkgs.glib
              pkgs.webkitgtk_4_1
              pkgs.librsvg
              pkgs.libsoup_3
              pkgs.libayatana-appindicator
              pkgs.openssl
            ]}:$LD_LIBRARY_PATH"

            if [ "''${XDG_SESSION_TYPE:-}" = "wayland" ] && { [ -e /sys/module/nvidia_drm ] || [ -e /proc/driver/nvidia/version ]; } && [ -z "''${__NV_DISABLE_EXPLICIT_SYNC+x}" ]; then
              export __NV_DISABLE_EXPLICIT_SYNC=1
              echo "WebKit NVIDIA explicit sync: disabled for Wayland compatibility"
            fi

            echo "WallCarousel development environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "Rust: $(rustc --version)"
            echo "WebKit DMA-BUF renderer: automatic"
          '';
        };
      }
    );
}
