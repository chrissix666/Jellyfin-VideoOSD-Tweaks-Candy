[Jellyfin Projects](https://linktr.ee/JellyfinProjects) | [Kodi Projects](https://linktr.ee/KodiProjects)

---

<img src="logo.png" width="100%">

*Not affiliated with or endorsed by Jellyfin.*

---

# VideoOSD Tweaks and Candy

- [What This Is](#what-this-is)
- [What This Is Not](#what-this-is-not)
- [Tweaks](#tweaks)
- [Candy](#candy)
- [Installation](#installation)
- [Settings Not Applying?](#settings-not-applying)
- [Tested On](#tested-on)
- [License](#license)

---

This plugin grew out of my [Jellyfin VideoOSD Projects](https://github.com/chrissix666/Jellyfin-VideoOSD-Projects-Overview), a collection of standalone scripts for the Jellyfin video OSD. The scripts continue to work independently via JavaScript injector.

VideoOSD Tweaks and Candy brings everything together in one Jellyfin plugin, and adds a layer of control over the vanilla OSD that was not possible before: hide individual elements, reorder them across all four zones, and shape the OSD exactly the way you want it. On top of that, eight optional addons extend the player with features familiar from VLC and beyond. And then there is the Candy.

---

## What This Is

The Jellyfin video OSD is functional, but fixed. You get what Jellyfin gives you, in the order Jellyfin decided.

VideoOSD Tweaks and Candy changes that. Every vanilla OSD element can be individually hidden or repositioned across four independent zones: top left, top right, bottom left, and bottom right. No compromise layout, no living with buttons you never use.

On top of that, eight optional addons bring the controls you actually want: playback speed steps, frame-by-frame navigation, A-B loop, quick download, screenshots, and a Custom On/Off Menu to toggle all of it without leaving the video. Think of it as a VLC crossover for the Jellyfin OSD, extended with things VLC never had.

And then there is the Candy. Artwork Display overlays your library artwork directly onto the OSD during playback. Fully configurable down to the smallest detail.

---

## What This Is Not

VideoOSD Tweaks and Candy is not a skin, not a theme, not a custom player, not a replacement for Jellyfin Web, not standalone CSS, and not a frontend of its own.

It is a plugin that sits on top of vanilla Jellyfin Web and builds on it. The OSD still looks and feels like Jellyfin. Everything is native, just packed with features, customization, and control that vanilla does not offer out of the box.

---

## Tweaks

### Vanilla OSD Control

Hide or reorder any vanilla Jellyfin OSD element independently across all four zones. Each zone is configured separately through the admin dashboard. Full freedom, no tradeoffs.

### Custom On/Off Menu

A quick-switch submenu directly inside the playback settings. Toggle any addon on or off without leaving the video.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomOnOff-Menu/main/Screenshot-Main.png" width="500">
<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomOnOff-Menu/main/Screenshot-Sub.png" width="500">

### Custom Playback Speed Buttons

Step up and down through playback speeds directly from the OSD. A center field shows the current speed and resets to 1x on click. Uses your own custom speed values when the Speed Menu is installed, falls back to Jellyfin vanilla speeds otherwise.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomPlaybackSpeed-Buttons/main/Screenshot.png" width="500">

### Custom Playback Speed Menu

Define your own speed list. Add values you actually use, remove the ones you never touch. Works together with the Speed Buttons.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomPlaybackSpeed-Menu/main/Screenshot.png" width="300">

### Frame-by-Frame Buttons

Step one frame backward or forward during paused playback. FPS-aware. Works within the limitations of the Chrome video engine, not a full VLC-style frame engine, but as close as the browser allows.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-FrameByFrame-Buttons/main/Screenshot.png" width="500">

### Download Button

Download the currently playing video as a direct 1:1 copy with one click. No transcoding, no quality loss, no menu diving.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Download-Button/main/Screenshot.jpg" width="500">

### Screenshot Button

Single click for one screenshot, hold for rapid-fire, double-click to toggle automatic mode. Saved as PNG with timestamp and video title.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Screenshot-Button/main/Screenshot.png" width="500">

### A-B Loop Button

Click once to set the start, click again to set the end, and the video loops that section endlessly. Third click clears it. Just like VLC.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-ABLoop-Button/main/Screenshot.png" width="500">

---

## Candy

### Artwork Display

Overlay artwork during playback, fully configurable down to the smallest detail.

Supported types: Logo, Clearart, Disc, Poster, Thumb, Banner, Backdrop.

Each artwork type is configured separately for movies, episodes, and videos. Position, size, offset, z-index, source priority, fallback behavior, spinning disc animation, series and season fallbacks. Everything.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Artwork-Display/main/Screenshot.jpg" width="600">

---

## Installation

Requires the [File Transformation Plugin](https://github.com/jellyfin/jellyfin-plugin-filetransformation) to be installed first.

**Via Plugin Catalog (recommended)**

1. In Jellyfin, go to Dashboard > Plugins > Repositories
2. Add a new repository with this URL:
   `https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Tweaks-Candy/main/manifest.json`
3. Go to the Catalog tab, find VideoOSD Tweaks and Candy, and install it
4. Restart Jellyfin
5. Configure the plugin under Dashboard > Plugins > VideoOSD Tweaks and Candy

**Manual Installation**

1. Download the latest release ZIP from the [Releases page](https://github.com/chrissix666/Jellyfin-VideoOSD-Tweaks-Candy/releases)
2. Extract the contents into your Jellyfin plugins folder
3. Restart Jellyfin
4. Configure the plugin under Dashboard > Plugins > VideoOSD Tweaks and Candy

---

## Settings Not Applying?

Every once in a while, a saved setting doesn't seem to take effect right away, even after saving and reloading. To be explicit about this: **this is not a bug in VideoOSD Tweaks and Candy**, it's normal browser caching behavior. Your browser can hang onto an old cached copy of the page or script instead of fetching the new one, and this same thing can happen with other Jellyfin plugins and addons too, not just this one; it's just how browsers work, not something specific to this plugin.

If that happens: open your browser's DevTools (right-click anywhere, **Inspect**), go to the **Network** tab, and check **Disable cache**. Leave DevTools open, don't close it, then refresh the page and open the plugin settings again. With DevTools open and that box checked, the browser is forced to fetch everything fresh instead of reusing anything cached.

**Fixing settings that aren't applying: disable cache workaround**

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-Cinema-Project/main/screenshots/settings-cache-workaround.png" width="700" alt="Settings not applying, disable cache workaround">

---

## Tested On

- Jellyfin Web 10.10.7
- Google Chrome
- Windows 11

---

## License

MIT License

Forking and further development strongly encouraged.
Feedback and bug reports welcome, feel free to open an issue.

---
