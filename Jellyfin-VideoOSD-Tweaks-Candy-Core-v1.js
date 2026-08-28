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
 *
 * FIX for a real, serious bug found live: an earlier version used ONE
 * MutationObserver watching the ENTIRE document.body subtree for any
 * class/style change, anywhere on the site. This fired constantly during
 * any period of heavy DOM activity, not just video playback -- confirmed
 * live to also fire heavily while the admin Dashboard was loading (many
 * requests/renders in quick succession: ScheduledTasks, ActivityLog,
 * LiveTv, etc), reported as the whole page becoming unresponsive
 * ("durchgehend am laden, kann nichts drücken"). Made worse once a
 * separate, correct fix (retrying fetchPluginConfig() until
 * window.ApiClient is ready) started reliably succeeding: before that
 * fix, the broad observer often never even got attached at all (the
 * config fetch failed immediately, so observer.observe() was never
 * reached), which is exactly why this went unnoticed for a while ("works
 * fine, except hide doesn't" was really "the expensive observer never
 * actually activates").
 *
 * Rebuilt using the same page lifecycle events Jellyfin's own code uses
 * internally (confirmed against the real source: src/components/Page.tsx
 * dispatches "pageshow"/"pagehide" with bubbles:true directly on each
 * page's own root element on every navigation, exactly the same pattern
 * Jellyfin's own pageClassOn()/pageIdOn() utilities are built on). This
 * script listens for those instead of a document-wide observer: it only
 * does anything on video-page navigation, and while actually on the video
 * page, only observes for changes within #videoOsdPage's own (much
 * smaller) subtree, never the whole document.
 */

(function () {
    'use strict';

    const PLUGIN_GUID = '468b1980-7a6c-4e45-a129-24825085ece4';
    const OSD_PAGE_ID = 'videoOsdPage';

    // FIX for a real bug found live: Jellyfin is a single-page app, this
    // script's <script defer> tag runs once, at the very first index.html
    // parse, which can easily happen BEFORE Jellyfin's own window.ApiClient
    // global has finished initializing. An earlier version gave up
    // permanently on the very first failed attempt (no retry at all), so
    // if that first attempt lost the race against ApiClient's own startup,
    // currentConfig stayed null for the rest of the whole browser session.
    // Retries every 250ms for up to 30 seconds, generous enough for a slow
    // app bootstrap, not literally forever in case something else is wrong.
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
        const page = document.getElementById(OSD_PAGE_ID);
        return !!page && !page.classList.contains('hide');
    }

    // ============================================================
    // VANILLA HIDE/SHOW -- elements fully contained within the video OSD
    // page itself. Scoped to "#videoOsdPage " (confirmed genuine
    // descendants in the real markup): most of these class names are also
    // reused elsewhere (photo slideshow, item detail pages), left
    // unscoped this would also affect those completely unrelated pages.
    // ============================================================
    function applyOsdInternalHides(config) {
        setHidden('#videoOsdPage .btnPause', config.HidePlayPauseButton);
        setHidden('#videoOsdPage .btnRewind, #videoOsdPage .btnFastForward', config.HideRewindFastForward);
        setHidden('#videoOsdPage .btnPreviousChapter, #videoOsdPage .btnNextChapter', config.HideChapterButtons);
        setHidden('#videoOsdPage .btnPreviousTrack, #videoOsdPage .btnNextTrack', config.HideTrackButtons);
        setHidden('#videoOsdPage .btnRecord', config.HideRecordButton);
        setHidden('#videoOsdPage .osdTimeText', config.HideEndsAtInfo);

        setHidden('#videoOsdPage .btnUserRating', config.HideFavoriteButton);
        setHidden('#videoOsdPage .btnSubtitles', config.HideSubtitlesButton);
        setHidden('#videoOsdPage .btnAudio', config.HideAudioButton);
        setHidden('#videoOsdPage .buttonMute', config.HideMuteButton);
        setHidden('#videoOsdPage .osdVolumeSliderContainer', config.HideVolumeSlider);
        setHidden('#videoOsdPage .btnVideoOsdSettings', config.HideSettingsButton);
        setHidden('#videoOsdPage .btnPip', config.HidePictureInPictureButton);
        setHidden('#videoOsdPage .btnFullscreen', config.HideFullscreenButton);
        setHidden('#videoOsdPage .btnAirPlay', config.HideAirPlayButton);
    }

    // ============================================================
    // VANILLA HIDE/SHOW -- shared GLOBAL header elements (Back/Title/
    // SyncPlay/Cast). Gated to isVideoOsdActive(): confirmed from the
    // real source, these live in the app's own separate AppHeader
    // component, a SIBLING of #videoOsdPage, reused on every single page
    // site-wide, not just the video OSD.
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
    // a dash ("Name - (2008)").
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
        // Gated the same way applyHeaderButtonHides() is: h3.pageTitle is
        // the SAME shared header title element on every single page
        // site-wide, not just the video OSD.
        if (!isVideoOsdActive()) return;

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

    // FIX for a real, serious bug found live: this used to be ONE
    // MutationObserver watching the entire document.body subtree for any
    // class/style change, anywhere on the site, all the time. Replaced
    // with the same page lifecycle events Jellyfin's own code uses
    // internally ("pageshow"/"pagehide", bubbling, dispatched directly on
    // #videoOsdPage on every navigation, confirmed against the real
    // source). The only ongoing observer now is scoped to #videoOsdPage's
    // own (much smaller) subtree, and only exists at all while actually
    // on the video page, disconnected the instant we navigate away.
    let osdObserver = null;

    function startOsdObserver() {
        if (osdObserver) return;
        const osdPage = document.getElementById(OSD_PAGE_ID);
        if (!osdPage) return;
        osdObserver = new MutationObserver(function () {
            applyAll();
        });
        osdObserver.observe(osdPage, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function stopOsdObserver() {
        if (!osdObserver) return;
        osdObserver.disconnect();
        osdObserver = null;
    }

    function onVideoOsdShow() {
        applyAll();
        refreshItemInfoAndReapply();
        startOsdObserver();
    }

    function onVideoOsdHide() {
        stopOsdObserver();
        // Re-run once more so the header elements (Back/Title/Sync/Cast)
        // correctly un-hide again now that we've left the video page,
        // isVideoOsdActive() inside applyHeaderButtonHides()/
        // applyTitleDisplay() picks up the new state on its own.
        applyAll();
    }

    document.addEventListener('pageshow', function (e) {
        if (e.target && e.target.id === OSD_PAGE_ID) {
            onVideoOsdShow();
        }
    });

    document.addEventListener('pagehide', function (e) {
        if (e.target && e.target.id === OSD_PAGE_ID) {
            onVideoOsdHide();
        }
    });

    fetchPluginConfig().then(function (pluginConfig) {
        if (!pluginConfig) return;

        currentConfig = pluginConfig;

        // Catches the case where the video OSD was already active by the
        // time this config fetch finished (e.g. a page refresh while a
        // video was already playing), so its own earlier "pageshow" event
        // (which fired before our listener above was even attached yet,
        // since that only happens after this whole async chain resolves)
        // wasn't missed.
        if (isVideoOsdActive()) {
            onVideoOsdShow();
        }
    }).catch(function (err) {
        // Defensive only: fetchPluginConfig() itself already catches its
        // own errors internally and never rejects, this just protects
        // against anything unexpected in the callback above becoming an
        // unhandled promise rejection.
        console.error('[VideoOSD Tweaks and Candy] Core init failed:', err);
    });
})();
