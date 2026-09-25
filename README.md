<p align="center">
  <img src="./src-tauri/icons/wall_icon.png" alt="WallCarousel icon" align="center" height="80" />

  <p align="center">A local wallpaper library, carousel picker, and slideshow for Linux and macOS.<br />Built around Tauri, React, Three.js, and native wallpaper integrations.</p>

  <p align="center">
    <strong><a href="https://github.com/BrianGithubAcc/wallcarousel">WallCarousel on GitHub</a></strong>
  </p>
</p>

## Project Overview

WallCarousel organises local wallpapers, groups them into playlists, browses them
through a 3D mathematical carousel, and applies them to the desktop. Linux uses
[AWWW](https://codeberg.org/LGFae/awww); macOS uses its native desktop-picture
integration.

The application is designed for a local-first workflow. Wallpaper files stay in
their original folders; the application stores only local metadata, playlists,
preferences, and carousel settings.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack Overview](#tech-stack-overview)
- [Getting Started Locally](#getting-started-locally)
  - [Nix development shell](#nix-development-shell)
  - [macOS](#macos)
  - [Install from GitHub in NixOS](#install-from-github-in-nixos)
  - [Run the development application](#run-the-development-application)
  - [Build and install locally](#build-and-install-locally)
  - [Portable Linux bundle](#portable-linux-bundle)
- [Using WallCarousel](#using-wallcarousel)
  - [Library and playlists](#library-and-playlists)
  - [3D carousel](#3d-carousel)
  - [Slideshow](#slideshow)
  - [Desktop overlay](#desktop-overlay)
- [Additional Information and Resources](#additional-information-and-resources)
  - [Project layout](#project-layout)
  - [Testing and checks](#testing-and-checks)
  - [Sending a Pull Request](#sending-a-pull-request)
- [License](#license)

## Tech Stack Overview

WallCarousel has a TypeScript/React frontend and a Rust/Tauri desktop shell.

- [React](https://react.dev) and [TypeScript](https://www.typescriptlang.org/)
  provide the application UI.
- [Vite](https://vite.dev) builds the frontend.
- [Three.js](https://threejs.org) renders the mathematical carousel and equation
  graph.
- [Tauri](https://tauri.app) provides the native Linux/macOS window, tray
  integration, filesystem access, and single-instance behavior.
- [AWWW](https://codeberg.org/LGFae/awww) applies wallpapers and runs slideshow
  transitions on Linux. macOS delegates wallpaper changes to System Events.
- [Nix flakes](https://nixos.wiki/wiki/Flakes) provide a reproducible Linux
  development environment and local build.

## Getting Started Locally

The supported development environment is Linux with Nix flakes enabled. The
provided shell includes Node.js, pnpm, Rust, GTK/WebKit dependencies, and AWWW.

### Nix development shell

Clone the repository and enter the project directory:

```sh
git clone https://github.com/BrianGithubAcc/wallcarousel.git
cd wallcarousel
```

Install frontend dependencies from the lockfile:

```sh
nix develop -c pnpm install --frozen-lockfile
```

The development shell also supplies the GTK layer-shell library used by the
Wayland overlay. AWWW is included for development, but the application still
uses the compositor session and displays available on the host system.

### macOS

Install Apple's command-line development tools, Rust, Node.js, and pnpm. Tauri's
macOS build requires Xcode or the Xcode Command Line Tools:

```sh
xcode-select --install
```

Install dependencies and start the native development application:

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

Build a macOS application bundle and DMG:

```sh
pnpm app:bundle:macos
```

The first time Wallcarousel changes a wallpaper, macOS may ask for permission to
control **System Events**. Allow it in **System Settings → Privacy & Security →
Automation**. macOS animates slideshow changes through a desktop-level overlay
behind normal application windows before applying the new desktop picture. The transition includes additional
zoom, push, blur, pixelate, stripe, checker, corner, diagonal, and spiral
effects.

### Install from GitHub in NixOS

The flake exposes both a package and an app for each supported system. To try
the latest public repository without adding it to a system configuration:

```sh
nix run github:BrianGithubAcc/wallcarousel
```

To install it into a user profile:

```sh
nix profile install github:BrianGithubAcc/wallcarousel
wallcarousel
```

For a NixOS flake configuration, add the repository as an input and include its
default package in `environment.systemPackages`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    wallcarousel.url = "github:BrianGithubAcc/wallcarousel";
    wallcarousel.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, wallcarousel, ... }:
    nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ({ pkgs, ... }: {
          environment.systemPackages = [
            wallcarousel.packages.${pkgs.system}.default
          ];
        })
      ];
    };
}
```

After adding the input, rebuild with `sudo nixos-rebuild switch --flake .`.
The package includes the native Tauri application, GTK/WebKit runtime libraries,
the tray icon, and the AWWW runtime path. AWWW still needs to be usable in the
active graphical session.

### Run the development application

Start Tauri with Vite hot reload:

```sh
nix develop -c pnpm tauri dev
```

Alternatively, use the helper script. It prepares the AWWW runtime path before
starting Tauri:

```sh
bash scripts/tauri-dev
```

The browser-only frontend can be started with `nix develop -c pnpm dev`, but
native wallpaper, tray, and overlay behavior requires the Tauri application.

### Build and install locally

Build the frontend and native application into `build/wallcarousel/`:

```sh
nix develop -c bash scripts/build-app
```

Install the result under `~/.local/opt/wallcarousel` and create the
`~/.local/bin/wallcarousel` launcher:

```sh
bash scripts/install-app
```

Quit the running application from its tray menu before replacing an installed
build. The launcher preserves the Nix library paths and AWWW path needed by the
locally built application. Nix garbage-collection roots are created for those
runtime dependencies.

Useful launch commands after installation:

```sh
wallcarousel              # Open the library window
wallcarousel --background # Start with the main window hidden
wallcarousel --overlay    # Open the wallpaper picker
```

Repeated launches forward their request to the existing instance. If both
`--background` and `--overlay` are supplied, the overlay takes precedence.

### Portable Linux bundle

On a Linux distribution with Tauri's native build prerequisites installed:

```sh
pnpm install --frozen-lockfile
pnpm app:bundle
```

AppImages are written under
`src-tauri/target/release/bundle/appimage/`. AppImage packaging is separate from
the Nix local build and has not been verified on NixOS. The destination system
still needs a compatible AWWW installation.

## Using WallCarousel

### Library and playlists

Use the **Library** tab to add local image files and remove entries from the
library. The application keeps image paths and names in local storage; it does
not upload wallpapers.

Playlists can contain selected library images. The Carousel and Slideshow tabs
can use either all library images or one selected playlist.

### 3D carousel

The **Carousel** tab displays wallpapers along a configurable parametric path.
The presets include lines, waves, helices, circles, figure-eights, and spirals.
Custom paths use `X(t)`, `Y(t)`, and `Z(t)` expressions with trigonometric and
arithmetic functions.

Carousel movement uses measured arc length, so neighbouring wallpapers follow a
stable physical spacing along the equation rather than jumping when the curve's
speed changes. Perspective comes from the Three.js camera: cards farther from
the viewpoint naturally appear smaller, while off-screen cards are handled by
the renderer's frustum culling.

Card orientation can be changed independently of the path:

- **Face camera** makes each wallpaper plane point toward the viewer.
- **Align to grid** keeps every wallpaper on the same world-facing image plane.

Closed paths distribute the playlist around the measured loop. Infinite scroll
is available for open paths, and the equation graph can be hidden in Settings
when a larger preview is preferred.

### Slideshow

The **Slideshow** tab applies wallpapers on a timer and supports playlists,
shuffle, pause/resume, and manual next wallpaper. Linux supports AWWW transition
effects. macOS animates its selected transition through a desktop-level overlay
behind normal application windows before applying the new desktop picture.

The transition preview uses two selected wallpapers or sample landscapes. Change
the transition, duration, or frame rate to replay the preview; **Replay preview**
does not apply a wallpaper or save settings. Reduced-motion preferences are
respected by waiting for an explicit replay.

### Desktop overlay

On Hyprland and other compositors supporting GTK layer-shell, the Linux carousel
picker uses the overlay layer above application windows without a taskbar entry
or a fullscreen workspace. On macOS, it uses a borderless always-on-top window
covering the active display. Escape or selecting a wallpaper closes the picker
and releases keyboard focus.

Other desktops use a borderless always-on-top window as a fallback.

Add the following to `~/.config/hypr/hyprland.conf` to start WallCarousel with
the session and open the picker with `Super+W`:

```ini
exec-once = ~/.local/bin/wallcarousel --background
bind = SUPER, W, exec, ~/.local/bin/wallcarousel --overlay
```

Change the key binding if `Super+W` is already in use. A tray host such as
Waybar's tray module displays the application menu.

## Additional Information and Resources

### Project layout

```text
src/                    React application and UI components
src/components/Carousel Three.js carousel, equations, and graph
src/components/Slideshow slideshow preview and transition helpers
src/hooks/              library, playlist, and carousel state
src-tauri/src/          Rust/Tauri integration and platform wallpaper control
scripts/                development, build, and installation helpers
public/                 static frontend assets
flake.nix               Nix development shell and package definition
```

Carousel configuration, playlists, library metadata, and preferences are
stored in browser local storage belonging to the application window. The native
side stores slideshow state in the platform application-data directory.

### Testing and checks

Run the TypeScript/Vite production build:

```sh
nix develop -c pnpm build
```

Run the native Rust checks:

```sh
nix develop -c cargo check --manifest-path src-tauri/Cargo.toml
```

Run the carousel geometry checks:

```sh
nix develop -c node --experimental-strip-types --test scripts/test-carousel-layout.mjs
```

The build currently reports a Vite bundle-size advisory for the main JavaScript
chunk; this does not prevent a successful build.

### Sending a Pull Request

1. Create a feature branch from `master`.
2. Make the smallest change that addresses the issue.
3. Run the build and relevant checks listed above.
4. Describe the user-visible change and testing performed in the pull request.
5. Include screenshots or a short recording for UI or carousel changes when
   practical.

## License

No software license has been selected for this repository yet. Until a license
file is added, the source remains copyright of its author and public visibility
does not grant permission to reuse, modify, or redistribute it.

Choose and add a license before treating the public repository as an
open-source project.
