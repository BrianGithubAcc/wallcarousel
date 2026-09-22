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
        isLinux = pkgs.stdenv.hostPlatform.isLinux;

        runtimePath = pkgs.lib.optionalString isLinux (
          pkgs.lib.makeBinPath [ pkgs.awww ]
        );
        runtimeLibraryPath = pkgs.lib.optionalString isLinux (
          pkgs.lib.makeLibraryPath [
            pkgs.gtk-layer-shell
            pkgs.libayatana-appindicator
            pkgs.libappindicator-gtk3
          ]
        );

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
            nodejs
            pnpm
            pnpmConfigHook
          ] ++ pkgs.lib.optionals isLinux [
            pkg-config
            makeWrapper
          ];

          buildInputs = with pkgs; pkgs.lib.optionals isLinux [
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

          postInstall = if isLinux then ''
            mv $out/bin/app $out/bin/wallcarousel
            wrapProgram $out/bin/wallcarousel \
              --prefix PATH : ${runtimePath} \
              --prefix LD_LIBRARY_PATH : ${runtimeLibraryPath} \
              --prefix XDG_DATA_DIRS : ${pkgs.gsettings-desktop-schemas}/share:${pkgs.gtk3}/share \
              --set WEBKIT_DMABUF_RENDERER_FORCE_SHM 1

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
          '' else ''
            mv $out/bin/app $out/bin/wallcarousel
          '';

          meta = {
            description = "Wallpaper library and desktop carousel";
            mainProgram = "wallcarousel";
            platforms = pkgs.lib.platforms.linux ++ pkgs.lib.platforms.darwin;
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

          ] ++ pkgs.lib.optionals isLinux (with pkgs; [
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
          ]);

          shellHook = ''
            echo "WallCarousel development environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "Rust: $(rustc --version)"
            ${pkgs.lib.optionalString isLinux ''
              export WEBKIT_DMABUF_RENDERER_FORCE_SHM=1

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

              echo "WebKit DMA-BUF renderer: disabled"
            ''}
          '';
        };
      }
    );
}
