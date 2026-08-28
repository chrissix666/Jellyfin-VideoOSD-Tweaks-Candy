/*
 * Jellyfin-VideoOSD-Tweaks-Candy-Core-v1.js
 *
 * IMPORTANT: this script is NOT standalone-usable and has NO effect
 * whatsoever when run through a JavaScript Injector or userscript manager
 * on its own. It is a pure control center for the VideoOSD Tweaks and
 * Candy Jellyfin plugin: every single thing it does (hiding configured
 * vanilla elements, ordering mixed vanilla/custom OSD elements) reads its
 * settings exclusively from the plugin's own server-side configuration via
 * ApiClient.getPluginConfiguration(). Without the plugin installed, this
 * script finds no configuration to read, does nothing, and changes nothing
 * about the page. Unlike the other 8 mods in this project, it has no
 * "standalone defaults" of its own, because it has no independent feature
 * to fall back to, it only exists to apply settings the plugin provides.
 */

(function () {
    'use strict';

    const PLUGIN_GUID = '468b1980-7a6c-4e45-a129-24825085ece4';

    // FIX for a real bug found live: Jellyfin is a single-page app, this
    // script's <script defer> tag runs once, at the very first index.html
    // parse, which can easily happen BEFORE Jellyfin's own window.ApiClient
    // global has finished initializing. The original version below gave up
    // permanently on the very first failed attempt (no retry at all), so
    // if that first attempt lost the race against ApiClient's own startup,
    // currentConfig stayed null for the rest of the whole browser session,
    // and applyAll() never ran again, even long after ApiClient became
    // available (e.g. once the user actually started a video minutes
    // later). This matches exactly what was observed live: script loads
    // fine, CustomOnOff-Menu still works (independent logic, no config
    // fetch of its own), but every hide/reorder feature (which only this
    // Core script implements) never does anything at all. Retries every
    // 250ms for up to 30 seconds, generous enough for a slow app
    // bootstrap, not literally forever in case something else is wrong.
    async function fetchPluginConfig() {
        const maxAttempts = 120;
        const delayMs = 250;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (window.ApiClient && typeof ApiClient.getPluginConfiguration === 'function') {
                try {
                    const config = await ApiClient.getPluginConfiguration(PLUGIN_GUID);
                    if (config) return config;
                } catch (err) {
                    // fall through, try again after the delay below
                }
            }
            await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
        }
        return null;
    }

    // ============================================================
    // SHARED HIDE MECHANISM
    // ============================================================
    const FORCE_HIDE_CLASS = 'jvosd-tc-force-hide';
    const STYLE_ID = 'jvosd-tc-core-style';

    function ensureCoreStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `.${FORCE_HIDE_CLASS} { display: none !important; }`;
        document.head.appendChild(style);
    }

    function setHidden(selector, hidden) {
        document.querySelectorAll(selector).forEach(function (el) {
            el.classList.toggle(FORCE_HIDE_CLASS, !!hidden);
        });
    }

    function isVideoOsdActive() {
        const page = document.querySelector('#videoOsdPage');
        return !!page && !page.classList.contains('hide');
    }

    // ============================================================
    // VANILLA HIDE/SHOW -- elements fully contained within the video OSD
    // page itself. No OSD-active gating needed here.
    // ============================================================
    function applyOsdInternalHides(config) {
        setHidden('.btnPause', config.HidePlayPauseButton);
        setHidden('.btnRewind, .btnFastForward', config.HideRewindFastForward);
        setHidden('.btnPreviousChapter, .btnNextChapter', config.HideChapterButtons);
        setHidden('.btnPreviousTrack, .btnNextTrack', config.HideTrackButtons);
        setHidden('.btnRecord', config.HideRecordButton);
        setHidden('.osdTimeText', config.HideEndsAtInfo);

        setHidden('.btnUserRating', config.HideFavoriteButton);
        setHidden('.btnSubtitles', config.HideSubtitlesButton);
        setHidden('.btnAudio', config.HideAudioButton);
        setHidden('.buttonMute', config.HideMuteButton);
        setHidden('.osdVolumeSliderContainer', config.HideVolumeSlider);
        setHidden('.btnVideoOsdSettings', config.HideSettingsButton);
        setHidden('.btnPip', config.HidePictureInPictureButton);
        setHidden('.btnFullscreen', config.HideFullscreenButton);
        setHidden('.btnAirPlay', config.HideAirPlayButton);
    }

    // ============================================================
    // VANILLA HIDE/SHOW -- shared GLOBAL header elements. Must be gated to
    // isVideoOsdActive(), the header is reused site-wide.
    // ============================================================
    function applyHeaderButtonHides(config) {
        const active = isVideoOsdActive();
        setHidden('.headerBackButton', active && config.HideBackButton);
        setHidden('.headerSyncButton', active && config.HideSyncPlayButton);
        setHidden('.headerCastButton', active && config.HideCastButton);
    }

    // ============================================================
    // TITLE RECONSTRUCTION
    // ============================================================
    const TITLE_ID = 'pageTitle';
    const RAW_TEXT_MARKER_ATTR = 'data-jvosdTcRawText';

    const EPISODE_TITLE_REGEX = /^(.*?)\s-\sS(\d+):E(\d+)(?:-(\d+))?\s-\s(.*?)(?:\s\((\d{4})\))?$/;
    const PLAIN_TITLE_REGEX = /^(.*?)(?:\s\((\d{4})\))?$/;

    function parseTitleSync(rawText) {
        const episodeMatch = rawText.match(EPISODE_TITLE_REGEX);
        if (episodeMatch) {
            return {
                kind: 'episode',
                seriesName: episodeMatch[1],
                season: episodeMatch[2],
                episode: episodeMatch[3],
                episodeEnd: episodeMatch[4] || null,
                episodeName: episodeMatch[5],
                year: episodeMatch[6] || null
            };
        }

        const plainMatch = rawText.match(PLAIN_TITLE_REGEX);
        return {
            kind: 'plain',
            name: plainMatch ? plainMatch[1] : rawText,
            year: plainMatch ? (plainMatch[2] || null) : null
        };
    }

    let cachedItemInfo = null;
    let cachedItemInfoName = null;

    async function getNowPlayingItemInfo() {
        if (!window.ApiClient?.getSessions) return null;
        try {
            const sessions = await ApiClient.getSessions();
            const session =
                sessions.find(function (s) { return s.NowPlayingItem && s.PlayState; }) ||
                sessions.find(function (s) { return s.NowPlayingItem; });
            const item = session?.NowPlayingItem;
            if (!item) return null;

            const itemName = item.Name || item.Id || 'unknown';
            if (cachedItemInfo && cachedItemInfoName === itemName) {
                return cachedItemInfo;
            }

            let kind = 'video';
            if (item.Type === 'Movie') kind = 'movie';
            else if (item.Type === 'Episode') kind = 'episode';

            cachedItemInfo = {
                kind: kind,
                originalTitle: item.OriginalTitle || null
            };
            cachedItemInfoName = itemName;
            return cachedItemInfo;
        } catch (err) {
            return null;
        }
    }

    // Year is rendered separately from the other parts, not through the
    // same " - " separator logic: confirmed against the real source, the
    // real format joins the year with a plain space ("Name (2008)"), never
    // a dash ("Name - (2008)"). An earlier version pushed the year into
    // the same orderedParts array as everything else, which incorrectly
    // gave it a " - " prefix too, caught by dynamic testing against a
    // simulated DOM and fixed here.
    function renderTitleParts(el, orderedParts, yearText) {
        const visible = orderedParts.filter(function (p) { return p.text; });
        el.innerHTML = '';
        visible.forEach(function (p, idx) {
            if (idx > 0) {
                const sep = document.createElement('span');
                sep.className = 'jvosd-tc-title-sep';
                sep.textContent = ' - ';
                el.appendChild(sep);
            }
            const span = document.createElement('span');
            span.className = 'jvosd-tc-title-' + p.key;
            span.textContent = p.text;
            el.appendChild(span);
        });

        if (yearText) {
            const yearSep = document.createElement('span');
            yearSep.className = 'jvosd-tc-title-year-sep';
            yearSep.textContent = ' ';
            el.appendChild(yearSep);

            const yearSpan = document.createElement('span');
            yearSpan.className = 'jvosd-tc-title-year';
            yearSpan.textContent = yearText;
            el.appendChild(yearSpan);
        }
    }

    function getEpisodeTitleOrder(config) {
        const DEFAULT_ORDER = ['series', 'sxe', 'title'];
        const raw = config.TopLeftOrder;
        if (typeof raw !== 'string' || !raw) return DEFAULT_ORDER;
        const requested = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        const known = requested.filter(function (k) { return DEFAULT_ORDER.includes(k); });
        const missing = DEFAULT_ORDER.filter(function (k) { return !known.includes(k); });
        return known.concat(missing);
    }

    function applyTitleDisplay(config, itemInfo) {
        const el = document.querySelector('h3.' + TITLE_ID);
        if (!el) return;

        const rawText = el.getAttribute(RAW_TEXT_MARKER_ATTR) === el.textContent
            ? el.dataset.jvosdTcSourceText
            : el.textContent;

        if (!rawText) return;

        if (config.HideTitleBar) {
            el.classList.add(FORCE_HIDE_CLASS);
            return;
        }
        el.classList.remove(FORCE_HIDE_CLASS);

        const parsed = parseTitleSync(rawText);
        const kind = itemInfo?.kind || (parsed.kind === 'episode' ? 'episode' : null);

        const includeYear = kind === 'movie' ? !config.HideYearMovies
            : kind === 'episode' ? !config.HideYearEpisodes
                : kind === 'video' ? !config.HideYearVideos
                    : true;

        const yearText = (includeYear && parsed.year) ? ('(' + parsed.year + ')') : '';

        let orderedParts;

        if (parsed.kind === 'episode') {
            const order = getEpisodeTitleOrder(config);
            const partsByKey = {
                series: { key: 'series', text: config.HideSeriesTitle ? '' : parsed.seriesName },
                sxe: { key: 'sxe', text: config.HideSeasonEpisodeNumber ? '' : ('S' + parsed.season + ':E' + parsed.episode + (parsed.episodeEnd ? '-' + parsed.episodeEnd : '')) },
                title: { key: 'title', text: config.HideEpisodeTitle ? '' : parsed.episodeName }
            };
            orderedParts = order.map(function (k) { return partsByKey[k]; });
        } else {
            const nameParts = [{ key: 'name', text: parsed.name }];

            if (kind === 'movie' && config.ShowOriginalTitleMovies && itemInfo?.originalTitle && itemInfo.originalTitle !== parsed.name) {
                nameParts.push({ key: 'originaltitle', text: itemInfo.originalTitle });
            }

            orderedParts = nameParts;
        }

        // Note: Jellyfin's own setTitle() re-writes .pageTitle's plain
        // text on EVERY playback state change (confirmed against the real
        // source: volume, pause, playback rate, all funnel through the
        // same code path), not just on genuine item changes, wiping out
        // our span structure back to plain text every single time. This
        // means the rebuild below runs more often than a naive "only on
        // item change" assumption would suggest, an earlier attempt to
        // add a "skip if unchanged" shortcut here turned out to be
        // pointless, since Jellyfin already destroys our DOM structure
        // before we get a chance to check anything, there's no cheaper
        // path than just rebuilding every time. In practice this is a
        // synchronous, cheap operation (a handful of span elements), not
        // a real performance concern.
        renderTitleParts(el, orderedParts, yearText);

        el.dataset.jvosdTcSourceText = rawText;
        el.setAttribute(RAW_TEXT_MARKER_ATTR, el.textContent);
    }

    // ============================================================
    // ZONE ORDERING
    // ============================================================
    function applyOrder(container, orderCsv, idAttr) {
        if (!container || typeof orderCsv !== 'string' || !orderCsv) return;
        const order = orderCsv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!order.length) return;

        // Processed in reverse, each moved to the very front via
        // insertBefore(firstChild): after all of them run, the elements
        // end up in exactly the specified order at the start of the
        // container, with anything not listed pushed after them in its
        // own natural remaining order. Deliberately consistent with
        // CustomOnOff-Menu's own "listed items first in the specified
        // order, unlisted appended after" fallback for the exact same
        // "partial custom order" situation, not the opposite (an earlier
        // version of this function pushed listed items to the END
        // instead, which was inconsistent with that and has been
        // corrected).
        order.slice().reverse().forEach(function (id) {
            const el = container.querySelector('[' + idAttr + '="' + CSS.escape(id) + '"]');
            if (el) container.insertBefore(el, container.firstChild);
        });
    }

    function applyTopRightOrder(config) {
        const container = document.querySelector('.headerRight');
        if (!container) return;
        const sync = container.querySelector('.headerSyncButton');
        const cast = container.querySelector('.headerCastButton');
        if (sync) sync.setAttribute('data-jvosd-order-id', 'sync');
        if (cast) cast.setAttribute('data-jvosd-order-id', 'cast');
        applyOrder(container, config.TopRightOrder, 'data-jvosd-order-id');
    }

    function applyBottomLeftOrder(config) {
        const container = document.querySelector('.videoOsdBottom .buttons.focuscontainer-x > div[dir="ltr"]');
        if (!container) return;

        const idMap = {
            abloop: '#btnAbLoop',
            speed: '.jfb-speed-step-container',
            framebyframe: '.jfb-frame-step-container'
        };
        Object.keys(idMap).forEach(function (id) {
            const el = container.querySelector(idMap[id]);
            if (el) el.setAttribute('data-jvosd-order-id', id);
        });
        applyOrder(container, config.BottomLeftOrder, 'data-jvosd-order-id');
    }

    function applyBottomRightOrder(config) {
        const favBtn = document.querySelector('.btnUserRating');
        const container = favBtn?.parentNode;
        if (!container) return;

        const idMap = {
            favorite: '.btnUserRating',
            // Confirmed from the real InPlayerEpisodePreview source
            // (a separate, third-party plugin many users have installed
            // alongside this one): its button has a fixed id
            // "popupPreviewButton" (not a class), and its own insertion
            // logic (childBefore.after(...), where childBefore is the
            // Favorite button) places it immediately after Favorite by
            // default, confirmed directly from its own BaseTemplate code.
            // Already gracefully handled if it's not actually installed:
            // container.querySelector() below simply finds nothing and
            // the loop skips it entirely, same as every other item here.
            episodepreview: '#popupPreviewButton',
            subtitles: '.btnSubtitles',
            audio: '.btnAudio',
            mute: '.buttonMute',
            volumeslider: '.osdVolumeSliderContainer',
            settings: '.btnVideoOsdSettings',
            pip: '.btnPip',
            fullscreen: '.btnFullscreen',
            airplay: '.btnAirPlay',
            download: '.btnDownload',
            screenshot: '.btnScreenshot'
        };
        Object.keys(idMap).forEach(function (id) {
            const el = container.querySelector(idMap[id]);
            if (el) el.setAttribute('data-jvosd-order-id', id);
        });
        applyOrder(container, config.BottomRightOrder, 'data-jvosd-order-id');
    }

    // ============================================================
    // ORCHESTRATION
    // ============================================================
    let currentConfig = null;
    let currentItemInfo = null;

    function applyAll() {
        if (!currentConfig) return;
        ensureCoreStyle();
        applyOsdInternalHides(currentConfig);
        applyHeaderButtonHides(currentConfig);
        applyTitleDisplay(currentConfig, currentItemInfo);
        applyTopRightOrder(currentConfig);
        applyBottomLeftOrder(currentConfig);
        applyBottomRightOrder(currentConfig);
    }

    async function refreshItemInfoAndReapply() {
        currentItemInfo = await getNowPlayingItemInfo();
        applyAll();
    }

    const observer = new MutationObserver(function () {
        applyAll();
    });

    fetchPluginConfig().then(function (pluginConfig) {
        if (!pluginConfig) return;

        currentConfig = pluginConfig;

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        applyAll();
        refreshItemInfoAndReapply();
    });
})();
