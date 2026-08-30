[Jellyfin Projects](https://linktr.ee/JellyfinProjects) | [Kodi Projects](https://linktr.ee/KodiProjects)

---

<img src="logo.png" width="100%">

*Not affiliated with or endorsed by Jellyfin.*

---

This plugin grew out of my [Jellyfin VideoOSD Projects](https://github.com/chrissix666/Jellyfin-VideoOSD-Projects-Overview), a collection of standalone scripts for the Jellyfin video OSD. The scripts continue to work independently via JavaScript injector.

I have developed many Jellyfin Web script mods over the years, but besides this one, only a single other true plugin: [Cinema Project](https://github.com/chrissix666/Jellyfin-Cinema-Project). A virtual cinema environment based on three.js that gives your movies an ambient feel, powered by visual metadata (artwork, theme songs, trailers, and more).

---

# VideoOSD Tweaks and Candy

- [What This Is](#what-this-is)
- [What This Is Not](#what-this-is-not)
- [Under the Hood](#under-the-hood)
  - [Architecture](#architecture)
  - [Instant OSD](#instant-osd)
- [General Tweaks](#general-tweaks)
  - [On/Off - Custom Addons](#onoff)
  - [Hide - Vanilla Elements](#hide)
  - [Sort - Vanilla & Custom Addon Elements](#sort)
- [Custom Tweaks](#custom-tweaks)
  - [Custom On/Off Menu](#custom-onoff-menu)
  - [Custom Playback Speed Menu](#custom-playback-speed-menu)
  - [Custom Playback Speed Buttons](#custom-playback-speed-buttons)
  - [Frame-by-Frame Buttons](#frame-by-frame-buttons)
  - [A-B Loop Button](#a-b-loop-button)
  - [Download Button](#download-button)
  - [Screenshot Button](#screenshot-button)
- [Candy](#candy)
  - [Artwork Display](#artwork-display)
- [Installation](#installation)
- [Settings Management](#settings-management)
- [Settings Not Applying?](#settings-not-applying)
- [Developed For & Tested On](#developed-for--tested-on)
- [License](#license)

---

**VideoOSD Tweaks and Candy puts you in full control of the Jellyfin video player OSD. Hide, reorder, and extend every element, with optional VLC-familiar controls and artwork overlays on top.**

---

## What This Is

A Jellyfin Web plugin for modifying, reordering, and extending the native Jellyfin VideoOSD. A VideoOSD modifier and enhancer, not a skin, theme, or custom player.

The Jellyfin video OSD is functional, but fixed. You get what Jellyfin gives you, in the order Jellyfin decided.

This plugin changes that. Every vanilla OSD element can be individually hidden or repositioned across four independent zones: top left, top right, bottom left, and bottom right. No compromise layout, no living with buttons you never use.

On top of that, optional addons bring the controls you actually want: playback speed steps, frame-by-frame navigation, A-B loop, quick download, screenshots, and a Custom On/Off Menu to toggle all of it without leaving the video. Think of it as a VLC crossover for the Jellyfin OSD, extended with things VLC never had.

And then there is the Candy. Artwork Display overlays your library artwork directly onto the OSD during playback. Fully configurable down to the smallest detail.

---

## What This Is Not

VideoOSD Tweaks and Candy is not a skin, not a theme, not a custom player, not a replacement for Jellyfin Web, not standalone CSS, and not a frontend of its own.

It is a plugin that sits on top of vanilla Jellyfin Web and builds on it. The OSD still looks and feels like Jellyfin. Everything is native, just packed with features, customization, and control that vanilla does not offer out of the box.

---

## Under the Hood

### Architecture

VideoOSD Tweaks and Candy is not a single script thrown at a page. It is a proper multi-layer Jellyfin plugin built from three technologies working together.

The core is written in **C#** and runs server-side as a native Jellyfin plugin. It handles configuration, stores all settings in the Jellyfin backend, and controls which addons are delivered to the browser at all. Disabled addons never reach the client.

On top of that, individual **JavaScript** addons implement the actual OSD features. Each one is self-contained, independently toggleable, and delivered only when enabled. They interact with the Jellyfin Web frontend without modifying any core files.

Where JavaScript alone is not enough, targeted **CSS** fills the gaps, handling spacing, ordering, and visual integration so everything fits cleanly into the native Jellyfin OSD without looking bolted on.

### Instant OSD

Normally, when you open a video, the OSD briefly rebuilds itself from its vanilla state into your configured custom state. If you have a lot of customization set up, you can actually see this happen for a fraction of a second. It looks rough.

I managed to fix that. After the first video following a settings change, the new layout is cached locally. From that point on, the OSD builds directly in its custom state before the first frame is ever drawn. No visible rebuild, no flicker, no transition. It just looks the way you set it up, as if that were always how it was.

---

## General Tweaks

Hide or reorder any vanilla Jellyfin OSD element independently across all four zones. Each zone is configured separately through the admin dashboard.

- **Top Left:** back button and title bar elements (title, year, series info)
- **Top Right:** sync play and cast buttons
- **Bottom Left:** playback controls and custom addons, sortable among each other when multiple are enabled
- **Bottom Right:** vanilla elements and custom addons sorted together in one unified order, including full compatibility with the Episode Preview addon

Full freedom, no tradeoffs.

<img src="screenshots/general-settings.png" width="700">

---

### On/Off

Control which custom addons are active. Enable or disable each one independently. Disabled addons are not delivered to the browser at all, so only what you actually use is ever loaded.

- A-B Loop
- Speed
- Frame by Frame
- Screenshot
- Download
- Artwork
- Customs Submenu

---

### Hide

Vanilla OSD elements only. Hide individual buttons, labels, and controls across all four zones without touching anything else. The rest of the OSD stays exactly as Jellyfin intended it.

**Top Left**

- Hide Back Button
- Hide Title Bar
- Show Original Title (Movies)
- Hide Year (Movies)
- Hide Series Title
- Hide Season/Episode Number
- Hide Episode Title
- Hide Year (Episodes)
- Hide Year (Videos)

**Top Right**

- Hide SyncPlay Button
- Hide Cast Button

**Bottom Left**

- Hide Play/Pause Button
- Hide Rewind/Fast Forward
- Hide Chapter Buttons
- Hide Track Buttons
- Hide Record Button
- Hide "Ends At" Info

**Bottom Right**

- Hide Favorite Button
- Hide Subtitles Button
- Hide Audio Button
- Hide Mute Button
- Hide Volume Slider
- Hide Settings Button
- Hide AirPlay Button
- Hide Picture-in-Picture Button
- Hide Fullscreen Button

---

### Sort

Reorder both vanilla elements and custom addons across all four zones. Each zone has its own independent order.

- **Top Left:** for episodes the title bar splits into 3 parts: series title, season/episode number, and episode title, each reorderable individually.
- **Top Right:** a simple swap, as there are normally only two icons here: SyncPlay and Cast.
- **Bottom Left:** sort your custom addons among each other
- **Bottom Right:** vanilla elements and custom addons in one unified sortable list, including Episode Preview addon compatibility
- **Customs Submenu:** sort mode and custom order for the on/off submenu

---

## Custom Tweaks

Optional addons that extend the OSD with additional controls. Each one independently toggleable via the admin dashboard or the Custom On/Off Menu during playback.

---

### Custom On/Off Menu

A quick-switch submenu directly inside the playback settings. Toggle any addon on or off without leaving the video.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomOnOff-Menu/main/Screenshot-Main.png" width="500">
<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomOnOff-Menu/main/Screenshot-Sub.png" width="500">

**Settings**

The submenu order and sorting are configured in the General tab under Sort. Two options are available:

- Sort Mode (alphabetical or custom order)
- Custom Order

---

### Custom Playback Speed Menu

Define your own speed list. Add values you actually use, remove the ones you never touch. Works together with the Speed Buttons.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomPlaybackSpeed-Menu/main/Screenshot.png" width="300">

**Settings**

- Hide on Narrow Window
- Individual Centered Gap Override
- Centered Gap Value

---

### Custom Playback Speed Buttons

Step up and down through playback speeds directly from the OSD. A center field shows the current speed and resets to 1x on click. Uses your own custom speed values when the Speed Menu is installed, falls back to Jellyfin vanilla speeds otherwise.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-CustomPlaybackSpeed-Buttons/main/Screenshot.png" width="500">

<img src="screenshots/speed-settings.png" width="700">

**Settings**

- Hide on Narrow Window
- Individual Centered Gap Override
- Centered Gap Value

**Vanilla Speeds** (enable or disable each individually):

- 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x, 2.5x, 3x, 3.5x, 4x

**Custom Speeds**

- Custom Speeds (comma-separated, added on top of vanilla speeds)

---

### Frame-by-Frame Buttons

Step one frame backward or forward during paused playback. FPS-aware. Works within the limitations of the Chrome video engine, not a full VLC-style frame engine, but as close as the browser allows.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-FrameByFrame-Buttons/main/Screenshot.png" width="500">

<img src="screenshots/framebyframe-settings.png" width="700">

**Settings**

- Hide on Narrow Window
- Individual Centered Gap Override
- Centered Gap Value

---

### A-B Loop Button

Click once to set the start, click again to set the end, and the video loops that section endlessly. Third click clears it. Just like VLC.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-ABLoop-Button/main/Screenshot.png" width="500">

<img src="screenshots/abloop-settings.png" width="700">

**Settings**

- Hide on Narrow Window
- Individual Centered Gap Override
- Centered Gap Value

---

### Download Button

Download the currently playing video as a direct 1:1 copy with one click. No transcoding, no quality loss, no menu diving.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Download-Button/main/Screenshot.jpg" width="500">

<img src="screenshots/download-settings.png" width="700">

**Settings**

- Hide on Narrow Window
- **Filename Choice:**
  - Original Filename (1:1) - uses the exact filename as stored on the server
  - Library Name - uses the Jellyfin library title including year if enabled

**Include Year (Library Name only)**

- Movies
- Episodes
- Videos

---

### Screenshot Button

Single click for one screenshot, hold for rapid-fire, double-click to toggle automatic mode. Saved as PNG with timestamp and video title.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Screenshot-Button/main/Screenshot.png" width="500">

<img src="screenshots/screenshot-settings.png" width="700">

**Settings**

- Hide on Narrow Window
- **File Format:** PNG or JPG
- **Filename Source:**
  - Library Name - uses the Jellyfin library title
  - Original Filename - uses the original file name
- **Filename Pattern:**
  - "Screenshot" + Timestamp + Label
  - "Screenshot" + Timestamp (Snipping Tool Style)
  - "Screenshot" + Label
  - Timestamp + Label
  - "Screenshot" Only

**Include Year (Library Name only)**

- Movies
- Episodes
- Videos

**Rapid-Fire Mode (hold to shoot)**

- Enabled
- Interval (ms)

**Auto Mode (double-click)**

- Enabled
- Interval (ms)

---

## Candy

### Artwork Display

Overlay artwork during playback, fully configurable down to the smallest detail.

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Artwork-Display/main/Screenshot.jpg" width="600">

*Screenshots are only example showcase. It absolutely does not mean that everything should be displayed at the same time like stickers. Of course it looks best with just one layer, for example a clearlogo left top or clearart right bottom, and at most a second one added, such as discart or season poster.*

<img src="screenshots/artwork-settings.png" width="700">

Each artwork type is configured independently for **Movies**, **Episodes**, and **Videos**.

**Artwork Types**

Movies and Videos:

- Logo, Clearart, Disc, Poster, Thumb, Banner, Backdrop

Episodes (additionally):

- Poster (Season), Poster (Episode), Thumb (Season), Banner (Season), Backdrop (Season), Backdrop 1-9

**Settings per Artwork Type**

Every artwork type has its own full set of settings:

- Enabled
- Source Mode
- Horizontal position
- Vertical position
- Offset Left, Right, Top, Bottom
- Max Height, Max Width
- Z-Index

**Special: Disc**

- Spinning Disc animation
- Rotation Speed

**Special: Clearlogo Fallback Rules**

- Hide Clearlogo when Clearart is showing via fallback-to-logo
- Hide Clearlogo whenever Clearart is available

**Special: Season and Series Fallbacks (Episodes)**

- Poster (Season): Season fallback, Series fallback
- Poster (Episode): Season fallback, Series fallback
- Thumb (Season): Series fallback
- Banner (Season): Series fallback
- Backdrop (Season): Series fallback

---

## Installation

Requires the [File Transformation Plugin](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) to be installed first.

**Via Plugin Catalog (recommended)**

1. In Jellyfin, go to Dashboard > Plugins > Repositories
2. Add a new repository:
   - **Name:** anything you like, for example `VideoOSD Tweaks and Candy`
   - **URL:**

```
https://raw.githubusercontent.com/chrissix666/Jellyfin-VideoOSD-Tweaks-Candy/main/manifest.json
```

3. Go to the Catalog tab, find VideoOSD Tweaks and Candy, and install it
4. Restart Jellyfin
5. Configure the plugin under Dashboard > Plugins > VideoOSD Tweaks and Candy

**Manual Installation**

1. Download the latest release ZIP from the [Releases page](https://github.com/chrissix666/Jellyfin-VideoOSD-Tweaks-Candy/releases)
2. Extract the contents into your Jellyfin plugins folder
3. Restart Jellyfin
4. Configure the plugin under Dashboard > Plugins > VideoOSD Tweaks and Candy

---

## Settings Management

### Restore Defaults (Tab)

Every settings tab has its own **Restore defaults** button in the top right corner. It resets only the settings of that tab to their default values, everything else stays untouched.

### Restore Defaults (All)

The General tab has an additional **Restore all** button at the bottom. This resets every setting across all tabs back to their defaults in one go.

### Backup and Restore (All)

The General tab also includes a code-based backup system. **Generate** creates a compact code that represents your complete current settings. Copy it and store it somewhere safe. **Import** lets you paste that code back at any time to restore your full configuration, for example after a reinstall or when moving to a new server.

---

## Settings Not Applying?

Every once in a while, a saved setting doesn't seem to take effect right away, even after saving and reloading. To be explicit about this: **this is not a bug in VideoOSD Tweaks and Candy**, it's normal browser caching behavior. Your browser can hang onto an old cached copy of the page or script instead of fetching the new one, and this same thing can happen with other Jellyfin plugins and addons too, not just this one; it's just how browsers work, not something specific to this plugin.

If that happens: open your browser's DevTools (right-click anywhere, **Inspect**), go to the **Network** tab, and check **Disable cache**. Leave DevTools open, don't close it, then refresh the page and open the plugin settings again. With DevTools open and that box checked, the browser is forced to fetch everything fresh instead of reusing anything cached.

**Fixing settings that aren't applying: disable cache workaround**

<img src="https://raw.githubusercontent.com/chrissix666/Jellyfin-Cinema-Project/main/screenshots/settings-cache-workaround.png" width="700" alt="Settings not applying, disable cache workaround">

---

## Developed For & Tested On

- Designed and written for Jellyfin Web 10.10.7
- Google Chrome
- Windows 11

Other versions may work but are not tested and could lead to unexpected behavior.

---

## License

MIT License

Forking and further development strongly encouraged.
Feedback and bug reports welcome, feel free to open an issue.

---
