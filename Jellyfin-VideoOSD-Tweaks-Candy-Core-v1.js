/*
 * Jellyfin-VideoOSD-Tweaks-Candy-Core-v1.js
 *
 * IMPORTANT: this script is NOT standalone-usable and has NO effect
 * whatsoever when run through a JavaScript Injector or userscript manager
 * on its own. It is a pure control center for the VideoOSD Tweaks and
 * Candy Jellyfin plugin: every single thing it does (hiding configured
 * vanilla elements, ordering mixed vanilla/custom OSD elements) reads its
 * settings exclusively from the plugin's own server-side configuration via
 * its endpoint VideoOSDTweaksCandy/ClientConfiguration. Without the plugin, this
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
        let failures = 0;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // No ApiClient yet (jellyfin-web creates it once a server is
            // known, e.g. after the server selection page): wait without
            // using up an attempt, like the not-logged-in case below.
            if (!window.ApiClient) attempt--;
            if (window.ApiClient && typeof ApiClient.getJSON === 'function') {
                // Not logged in yet (e.g. still on the login page): every
                // request would only fail with 401, so wait without using up
                // an attempt (the whole budget used to run out right there).
                if (typeof ApiClient.accessToken === 'function' && !ApiClient.accessToken()) {
                    attempt--;
                    await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
                    continue;
                }
                try {
                    // The plugin's own endpoint, readable for every signed-in user.
                    const config = await ApiClient.getJSON(ApiClient.getUrl('VideoOSDTweaksCandy/ClientConfiguration'));
                    if (config) return config;
                    throw new Error('empty configuration');
                } catch (err) {
                    // 403: no access; 404: plugin not installed (standalone
                    // use). Retrying can't change
                    // either, so stop and use the defaults instead of sending
                    // up to 120 failing requests.
                    if (err && (err.status === 403 || err.status === 404)) return null;
                    // Server error (5xx), network error or empty answer: at most 3
                    // retries, 0.5 / 1 / 2 s apart, then the defaults until the next
                    // fetch (this used to send up to 120 requests in 30 s).
                    if (++failures > 3) return null;
                    await new Promise(function (resolve) { setTimeout(resolve, delayMs * Math.pow(2, failures)); });
                    continue;
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
        // FIX for a real bug found live, confirmed via actual Chromium
        // rendering: .pageTitle is "display: inline-flex" (confirmed
        // against the real source), and CSS whitespace-collapsing rules
        // strip leading/trailing space from a flex item's own text
        // content, so the plain " - " text that used to live inside the
        // separator span rendered visibly as just "-", no gap on either
        // side, same for the space before the year. Fixed with real
        // margin instead, which isn't subject to that same collapsing,
        // confirmed with an actual measured pixel gap (not just "should
        // work" -- 19.3px measured directly via a real headless browser
        // render before shipping this).
        // HISTORICAL NOTE (superseded, kept short): an interim version
        // of applyBottomRightOrder() extracted mute and the slider
        // container out of ".volumeButtons" and this style had to
        // re-build the wrapper's lost CSS containment (flex-grow
        // neutralization plus the native 43em narrow-window hide,
        // both derived from the real videoosd.scss). Both rules are
        // deliberately gone again since the order-model redesign:
        // The volume complex needs almost no CSS anymore since the
        // order-model redesign of applyBottomRightOrder(): the slider
        // stays inside its native ".volumeButtons" wrapper, so the
        // native flex-grow containment and the native 43em
        // narrow-window hide simply keep applying by themselves -- the
        // former compensation rules that re-built both for the
        // extracted state are deliberately removed again. The single
        // remaining rule below replaces the wrapper's native
        // asymmetric margin ("0 1em 0 0.29em", designed for its one
        // fixed vanilla position) with the uniform 0.29em every
        // button-sized neighbor carries, so the wrapper spaces
        // consistently at ANY sorted position. Direct-child selector
        // on purpose: it only ever matches this exact wrapper in this
        // exact bar.
        // Jellyfin 12.1, modern (MUI) layout: the video header is a React
        // toolbar (.videoOsd-appBar), the legacy header elements are
        // rendered but hidden. React owns those nodes, so they are never
        // changed directly: these rules act only while applyMuiHeader()
        // sets the matching flag on <html>. Buttons are found by their MUI
        // icon (data-testid), independent of the UI language. 10.10.7 and
        // the legacy layouts have no .videoOsd-appBar, so nothing matches.
        // Mute below 43em: Jellyfin hides .volumeButtons (mute + slider)
        // there (videoosd.scss); BottomRightOrder moves mute out of that
        // wrapper, so it is hidden here the same way.
        // [data-jvosd-mui-bar] = the same MUI video toolbar in the 10.10.7
        // "experimental" layout, which has no class of its own (getMuiBar()).
        // The buttons carry [data-jvosd-mui-btn] (markMuiButtons()), so the
        // rules need neither the has- nor the is- pseudo-class (older TV / browser engines).
        // [data-jvosd-pre-hide-*] cover the frames between the header's
        // mount and the first markMuiButtons() (React paints it before the
        // OSD page's "pageshow"): set from the config alone (applyMuiPreHides()),
        // they hide the icons wherever a MUI toolbar sits directly in a Box —
        // in both versions only the video header does (the app toolbar sits
        // in the AppBar header; jellyfin-web 10.10.7 / 12.1 sources).
        style.textContent = `.${FORCE_HIDE_CLASS} { display: none !important; }
.jvosd-tc-title-sep { margin: 0 0.35em; }
.jvosd-tc-title-year-sep { margin-left: 0.35em; }
.videoOsdBottom .buttons > .volumeButtons { margin: 0 0.29em; }
@media all and (max-width: 43em) { #videoOsdPage .videoOsdBottom .buttonMute { display: none !important; } }
html[data-jvosd-mui-hide-back] [data-jvosd-mui-btn="back"] { display: none !important; }
html[data-jvosd-mui-hide-sync] [data-jvosd-mui-btn="sync"] { display: none !important; }
html[data-jvosd-mui-hide-cast] [data-jvosd-mui-btn="cast"] { display: none !important; }
html[data-jvosd-mui-cast-first] [data-jvosd-mui-btn="cast"] { order: -1; }
html[data-jvosd-pre-hide-back] .MuiBox-root > .MuiToolbar-root svg[data-testid="ArrowBackIcon"],
html[data-jvosd-pre-hide-sync] .MuiBox-root > .MuiToolbar-root svg[data-testid="GroupsIcon"],
html[data-jvosd-pre-hide-cast] .MuiBox-root > .MuiToolbar-root svg[data-testid="CastIcon"],
html[data-jvosd-pre-hide-cast] .MuiBox-root > .MuiToolbar-root svg[data-testid="CastConnectedIcon"] { visibility: hidden !important; }
html[data-jvosd-mui-own-title] .videoOsd-appBar > .MuiTypography-root:not(.jvosd-tc-mui-title),
html[data-jvosd-mui-own-title] [data-jvosd-mui-bar] > .MuiTypography-root:not(.jvosd-tc-mui-title) { display: none !important; }`;
        document.head.appendChild(style);
    }

    function setHidden(selector, hidden) {
        document.querySelectorAll(selector).forEach(function (el) {
            el.classList.toggle(FORCE_HIDE_CLASS, !!hidden);
        });
    }

    // FIX for a real bug found live (OSD buttons such as Screenshot and
    // Download "sometimes" swapped despite a configured order): Jellyfin
    // keeps up to 3 pages alive in the DOM (viewContainer.js,
    // pageContainerCount = 3, slots reused round-robin), and every new
    // playback started from a non-video page pushes a FRESH
    // #videoOsdPage into the next slot. A stale, hidden #videoOsdPage
    // from an earlier playback can therefore still sit in an EARLIER
    // slot, and getElementById() (first match in document order) then
    // returned that dead page: the OSD looked inactive, the observer
    // watched the wrong subtree. The live OSD page is the one that is
    // not hidden (verified in the real source: the new/restored view has
    // no "hide" class by the time "pageshow" is dispatched, every other
    // slot has it). All OSD lookups go through this, never through a
    // document-wide query.
    // Set only for the duration of the synchronous re-apply inside the
    // "pagehide" handler: when leaving to a React page (search, user
    // profile, quick connect), Page.tsx -> viewManager.hideView()
    // dispatches "pagehide" BEFORE it adds "hide" to the OSD page
    // (verified in the real source), so without this the page that is
    // being left would still count as the live OSD.
    let leavingOsdPage = null;

    function getActiveOsdPage() {
        const pages = document.querySelectorAll('#' + OSD_PAGE_ID);
        for (let i = 0; i < pages.length; i++) {
            if (pages[i] !== leavingOsdPage && !pages[i].classList.contains('hide')) return pages[i];
        }
        return null;
    }

    function isVideoOsdActive() {
        return !!getActiveOsdPage();
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
        // FIX for a real, serious layout bug found live (with a
        // screenshot showing the whole right-hand button group shifted
        // left): confirmed against the real source, ".osdTimeText" isn't
        // just a text container, it carries "margin-right: auto", the
        // flexbox mechanism that pushes every button after it
        // (Favorite/Subtitles/Audio/Volume/Settings/etc) to the right
        // edge. Hiding the whole element removed that spacer entirely,
        // collapsing the whole right-hand group leftward. Fixed by
        // hiding only the inner ".endsAtText" span (confirmed from the
        // real source: "osdTimeText" wraps a nested "endsAtText" span),
        // which has no such margin, leaving the spacer intact. Verified
        // with an actual rendered Chromium page, not just reasoned about.
        setHidden('#videoOsdPage .osdTimeText .endsAtText', config.HideEndsAtInfo);

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

    // Year digits use \p{Nd} (with the "u" flag), not \d: Jellyfin
    // renders the year via toLocaleString() in the user's locale, which
    // yields native digits for e.g. fa/bn/mr/ne ("(۲۰۰۸)"), and \d
    // only matches ASCII digits. The episode name part is optional:
    // Jellyfin omits it for episodes without a name ("Show - S1:E2").
    const EPISODE_TITLE_REGEX = /^(.*?)\s-\sS(\d+):E(\d+)(?:-(\d+))?(?:\s-\s(.*?))?(?:\s\((\p{Nd}{4})\))?$/u;
    const PLAIN_TITLE_REGEX = /^(.*?)(?:\s\((\p{Nd}{4})\))?$/u;

    function parseTitleSync(rawText, itemInfo) {
        const episodeMatch = rawText.match(EPISODE_TITLE_REGEX);
        if (episodeMatch) {
            return {
                kind: 'episode',
                seriesName: episodeMatch[1],
                season: episodeMatch[2],
                episode: episodeMatch[3],
                episodeEnd: episodeMatch[4] || null,
                episodeName: episodeMatch[5] || '',
                year: episodeMatch[6] || null
            };
        }

        const plainMatch = rawText.match(PLAIN_TITLE_REGEX);

        // Episodes Jellyfin titles without "S1:E2": specials ("Show -
        // Special - Name", the middle label is localized, e.g. "Extra" in
        // German) and episodes without an index number ("Show - Name").
        // Parsing the localized label is not possible, so the known
        // series and episode names of the playing item are used to split
        // the title instead; the middle part is kept verbatim as the
        // season/episode part.
        if (plainMatch && itemInfo && itemInfo.kind === 'episode' && itemInfo.seriesName && itemInfo.name) {
            const body = plainMatch[1];
            const prefix = itemInfo.seriesName + ' - ';
            // The special label ("Extra - {0}") is joined to the episode
            // name with " - " or, in some translations, " – " (en dash;
            // German since Jellyfin 12.1).
            const suffixes = [' - ' + itemInfo.name, ' \u2013 ' + itemInfo.name];
            let sxeText = null;
            if (body === prefix + itemInfo.name) {
                sxeText = '';
            } else if (body.startsWith(prefix)) {
                const suffix = suffixes.find(function (s) {
                    return body.endsWith(s) && body.length > prefix.length + s.length;
                });
                if (suffix) sxeText = body.slice(prefix.length, body.length - suffix.length);
            }
            if (sxeText !== null) {
                return {
                    kind: 'episode',
                    seriesName: itemInfo.seriesName,
                    sxeText: sxeText,
                    episodeName: itemInfo.name,
                    year: plainMatch[2] || null
                };
            }
        }

        return {
            kind: 'plain',
            name: plainMatch ? plainMatch[1] : rawText,
            year: plainMatch ? (plainMatch[2] || null) : null
        };
    }

    let cachedItemInfo = null;
    let cachedItemInfoName = null;

    async function getNowPlayingItemInfo() {
        if (!(window.ApiClient && window.ApiClient.getSessions)) return null;
        try {
            const sessions = await ApiClient.getSessions({ deviceId: ApiClient.deviceId() });
            const session =
                sessions.find(function (s) { return s.NowPlayingItem && s.PlayState; }) ||
                sessions.find(function (s) { return s.NowPlayingItem; });
            const item = session && session.NowPlayingItem;
            if (!item) return null;

            const itemName = item.Id || item.Name || 'unknown';
            if (cachedItemInfo && cachedItemInfoName === itemName) {
                return cachedItemInfo;
            }

            let kind = 'video';
            if (item.Type === 'Movie') kind = 'movie';
            else if (item.Type === 'Episode') kind = 'episode';

            cachedItemInfo = {
                kind: kind,
                id: item.Id || null,
                originalTitle: item.OriginalTitle || null,
                name: item.Name || null,
                seriesName: item.SeriesName || null,
                type: item.Type || null
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
                sep.textContent = '-';
                el.appendChild(sep);
            }
            const span = document.createElement('span');
            span.className = 'jvosd-tc-title-' + p.key;
            span.textContent = p.text;
            el.appendChild(span);
        });

        if (yearText) {
            const yearSpan = document.createElement('span');
            yearSpan.className = 'jvosd-tc-title-year jvosd-tc-title-year-sep';
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

    // FIX for a real issue found live, a good simplification the user
    // pointed out: if every one of these settings is at its default (no
    // hiding, no reordering, no original-title extra), there's no reason
    // to touch .pageTitle's content at all, Jellyfin's own native
    // rendering is already exactly right. Rebuilding into our own span
    // structure regardless, even when it would end up looking identical,
    // was needless risk (and, before the spacing fix, is exactly what
    // was producing "shows everything again but no spaces" when the user
    // unchecked every hide option, since REBUILDING isn't automatically
    // the same as "left completely alone").
    function needsTitleIntervention(config) {
        if (config.HideTitleBar) return true;
        if (config.HideSeriesTitle || config.HideSeasonEpisodeNumber || config.HideEpisodeTitle) return true;
        if (config.HideYearMovies || config.HideYearEpisodes || config.HideYearVideos) return true;
        if (config.ShowOriginalTitleMovies) return true;
        if (typeof config.TopLeftOrder === 'string' && config.TopLeftOrder && config.TopLeftOrder !== 'series,sxe,title') return true;
        return false;
    }

    function applyTitleDisplay(config, itemInfo) {
        const el = document.querySelector('h3.' + TITLE_ID);

        // Gated the same way applyHeaderButtonHides() is: h3.pageTitle is
        // the SAME shared header title element on every single page
        // site-wide, not just the video OSD.
        // FIX for a real bug found live: with HideTitleBar, leaving the
        // OSD used to return here with the hide class still set, so the
        // shared header title (including the home page logo, which is
        // rendered through the same element) stayed hidden on every page
        // until a reload. Jellyfin never removes our class itself. The
        // render cache is dropped too, so the next OSD visit always
        // renders fresh.
        if (!isVideoOsdActive()) {
            if (el) {
                if (el.classList.contains(FORCE_HIDE_CLASS)) el.classList.remove(FORCE_HIDE_CLASS);
                // Jellyfin doesn't reset the title on every page, so our
                // rebuilt text could stay behind and be read as native text
                // on the next video start: put Jellyfin's own text back.
                const marker = el.getAttribute(RAW_TEXT_MARKER_ATTR);
                if (marker && marker === el.textContent && el.dataset.jvosdTcSourceText !== undefined) {
                    el.textContent = el.dataset.jvosdTcSourceText;
                }
                delete el.dataset.jvosdTcLastRenderSignature;
                el.removeAttribute(RAW_TEXT_MARKER_ATTR);
                delete el.dataset.jvosdTcSourceText;
            }
            titleRawTextForItemInfo = null;
            return;
        }

        if (!el) return;

        if (!needsTitleIntervention(config)) {
            // Nothing configured needs our own rendering at all. If an
            // earlier config change left our span structure in place
            // (its cached raw text still matches, i.e. Jellyfin hasn't
            // re-set the title since), restore plain native text and
            // clear our own bookkeeping, so a later real intervention
            // starts from a clean slate rather than an already-rebuilt
            // one.
            if (el.getAttribute(RAW_TEXT_MARKER_ATTR) === el.textContent && el.dataset.jvosdTcSourceText) {
                el.textContent = el.dataset.jvosdTcSourceText;
                el.removeAttribute(RAW_TEXT_MARKER_ATTR);
                delete el.dataset.jvosdTcSourceText;
            }
            el.classList.remove(FORCE_HIDE_CLASS);
            return;
        }

        // Original, correct logic, restored: el.textContent right now is
        // EITHER Jellyfin's own fresh text (if it just re-set the title)
        // OR our own previously-rebuilt span structure's concatenated
        // text (if nothing has re-set it since our last render) -- the
        // marker distinguishes which case this is, since parsing our own
        // already-rebuilt output as if it were fresh raw text would be
        // wrong.
        const rawText = el.getAttribute(RAW_TEXT_MARKER_ATTR) === el.textContent
            ? el.dataset.jvosdTcSourceText
            : el.textContent;

        if (!rawText) return;

        // FIX for a real bug found live: item info (kind, original title)
        // was only fetched on "pageshow", but the next item of a queue
        // (next episode, playlist) plays without any navigation
        // (appRouter.show() is a no-op for the path already shown), so the
        // new title was rendered with the previous item's kind/original
        // title. A new native title text means a new item: drop the old
        // info (the title falls back to the parsed kind until the fresh
        // info arrives) and fetch it again.
        if (rawText !== titleRawTextForItemInfo) {
            const firstTitle = titleRawTextForItemInfo === null;
            titleRawTextForItemInfo = rawText;
            if (!firstTitle) {
                currentItemInfo = null;
                itemInfo = null;
                refreshItemInfoAndReapply();
            }
        }

        // FIX, a real efficiency gap the user asked about directly:
        // confirmed against the real source that Jellyfin's own
        // time-display update runs (throttled) roughly every 700ms
        // during active playback and touches innerHTML, which this
        // script's osdObserver (childList: true) does pick up, so this
        // function used to unconditionally rebuild the title's span
        // structure on every one of those ticks even when nothing about
        // the title itself had changed, roughly 1-2 times per second of
        // pure wasted work.
        //
        // A first attempt at this reused RAW_TEXT_MARKER_ATTR directly
        // for this new check too, which broke the distinction the block
        // above depends on, caught before shipping it: comparing the
        // marker against a NEW signature meant future calls could no
        // longer tell "is el.textContent currently ours or Jellyfin's"
        // correctly, since the marker's actual purpose had been
        // repurposed. A separate cache field keeps the two concerns
        // apart. It also needs to include itemInfo, not just rawText:
        // itemInfo arrives ASYNCHRONOUSLY, after
        // refreshItemInfoAndReapply()'s own separate call to applyAll(),
        // so there's always a second call where rawText is identical to
        // the first render (itemInfo was null then) but itemInfo itself
        // has since become populated (kind, originalTitle) -- caching on
        // rawText alone would have permanently locked in the
        // pre-itemInfo render (e.g. movie original-title replacement
        // silently never applying).
        // FIX for a real bug found live: the signature alone was not
        // enough. When Jellyfin re-set the SAME title text (replaying the
        // same item, or its own re-set on audio/subtitle track changes),
        // rawText, itemInfo and the signature were unchanged, so this
        // returned early and left Jellyfin's native text on screen. The
        // early return now also requires that what is on screen is still
        // our own render. Likewise every title setting is part of the
        // signature, so a changed setting re-renders even for the same
        // title.
        const itemInfoSignature = ((itemInfo && itemInfo.kind) || '') + '\u0000' + ((itemInfo && itemInfo.originalTitle) || '') + '\u0000' + ((itemInfo && itemInfo.seriesName) || '') + '\u0000' + ((itemInfo && itemInfo.name) || '');
        const configSignature = [
            config.HideTitleBar, config.HideSeriesTitle, config.HideSeasonEpisodeNumber, config.HideEpisodeTitle,
            config.HideYearMovies, config.HideYearEpisodes, config.HideYearVideos, config.ShowOriginalTitleMovies,
            config.TopLeftOrder
        ].map(function (v) { return String(v); }).join('\u0000');
        const renderSignature = rawText + '\u0001' + itemInfoSignature + '\u0001' + configSignature;
        const stillOurRender = config.HideTitleBar
            ? el.classList.contains(FORCE_HIDE_CLASS)
            : el.getAttribute(RAW_TEXT_MARKER_ATTR) === el.textContent;
        if (stillOurRender && el.dataset.jvosdTcLastRenderSignature === renderSignature) return;
        el.dataset.jvosdTcLastRenderSignature = renderSignature;

        if (config.HideTitleBar) {
            if (!el.classList.contains(FORCE_HIDE_CLASS)) el.classList.add(FORCE_HIDE_CLASS);
            return;
        }
        el.classList.remove(FORCE_HIDE_CLASS);

        const parsed = parseTitleSync(rawText, itemInfo);
        const kind = (itemInfo && itemInfo.kind) || (parsed.kind === 'episode' ? 'episode' : null);

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
                sxe: { key: 'sxe', text: config.HideSeasonEpisodeNumber ? '' : (typeof parsed.sxeText === 'string' ? parsed.sxeText : ('S' + parsed.season + ':E' + parsed.episode + (parsed.episodeEnd ? '-' + parsed.episodeEnd : ''))) },
                title: { key: 'title', text: config.HideEpisodeTitle ? '' : parsed.episodeName }
            };
            orderedParts = order.map(function (k) { return partsByKey[k]; });
        } else {
            // FIX for a real behavior gap the user pointed out: this used
            // to APPEND the original title next to the normal one
            // ("Title - OriginalTitle"), matching the field's literal
            // description text ("Adds the ... original title next to its
            // title") but not what the user actually wants: the original
            // title should REPLACE the normal title entirely, falling
            // back to the normal title if no original title exists (or
            // is identical to it, nothing meaningful to switch to).
            const displayName = (kind === 'movie' && config.ShowOriginalTitleMovies && itemInfo && itemInfo.originalTitle && itemInfo.originalTitle !== parsed.name)
                ? itemInfo.originalTitle
                : parsed.name;
            orderedParts = [{ key: 'name', text: displayName }];
        }

        renderTitleParts(el, orderedParts, yearText);

        el.dataset.jvosdTcSourceText = rawText;
        el.setAttribute(RAW_TEXT_MARKER_ATTR, el.textContent);
    }

    // ============================================================
    // ZONE ORDERING
    // ============================================================
    // FIX for a real, serious bug found live, confirmed via actual
    // MutationObserver execution: insertBefore() ALWAYS generates a
    // childList mutation, even when moving an element to the exact
    // position it's already in. Since applyBottomLeftOrder() and
    // applyBottomRightOrder() run on containers that are genuine
    // descendants of #videoOsdPage (inside the very subtree Core's own
    // osdObserver watches), every call to the old version of this
    // function re-triggered that same observer, which called applyAll()
    // again, which called this function again, forever, as long as a
    // video was playing AND either order setting had a non-empty value
    // (from any earlier session, not necessarily one just set) --
    // continuous CPU churn with no natural end. Fixed by checking whether
    // the elements are ALREADY in the target order first, and doing
    // nothing at all if so, so a settled, correct order produces zero
    // further DOM mutations, breaking the feedback loop entirely.
    // FIX for a real, fundamental design flaw found live: this always
    // moved the tagged items to the ABSOLUTE front of the container
    // (container.firstChild). That's correct for zones where every
    // single child is one of the tagged items (Top-Right: only sync/
    // cast; Bottom-Right: all 12 items covered), but Bottom-Left's
    // container ALSO holds 7 untagged NATIVE vanilla buttons
    // (PreviousTrack/PreviousChapter/Rewind/Pause/FastForward/
    // NextChapter/NextTrack) that are genuinely not part of any order
    // list. Moving the 3 tagged custom mods to the absolute front
    // pushed every one of those 7 native controls AFTER them instead,
    // confirmed live via an actual test with a real native button
    // present in the container. Fixed by accepting an optional anchor
    // element: when given, items are inserted directly after that
    // anchor (in the specified sequence) instead of at the container's
    // own front, leaving anything before the anchor completely
    // untouched.
    function applyOrder(container, orderCsv, idAttr, anchor) {
        if (!container || typeof orderCsv !== 'string' || !orderCsv) return;
        const order = orderCsv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!order.length) return;

        const targetEls = order
            .map(function (id) { return container.querySelector('[' + idAttr + '="' + CSS.escape(id) + '"]'); })
            .filter(Boolean);
        if (!targetEls.length) return;

        const validAnchor = (anchor && anchor.parentNode === container) ? anchor : null;

        // FIX for a real, serious bug found live, confirmed via direct
        // instrumentation: this used to walk EVERY sibling node
        // (nextSibling), including plain whitespace TEXT nodes between
        // tags (nodeType 3), not just elements. Real HTML almost always
        // has such whitespace between tags, confirmed live: this threw
        // the positional comparison off by however many text nodes were
        // interspersed, so "already correct" could never actually match
        // even when the elements themselves were already in exactly the
        // right order, causing applyOrder() to endlessly re-run its
        // reordering logic on every single observer tick, and each of
        // THOSE reordering passes is itself a real mutation feeding
        // right back into triggering the observer again -- confirmed
        // live via an actual instrumented count: an unbroken,
        // self-sustaining loop, over 500 firings and still climbing.
        // Filtering to element nodes only (nodeType === 1) fixes this at
        // the root.
        const firstSlot = validAnchor ? validAnchor.nextSibling : container.firstChild;
        const currentFromSlot = [];
        for (let node = firstSlot; node; node = node.nextSibling) {
            if (node.nodeType === 1) currentFromSlot.push(node);
        }
        const alreadyCorrect = targetEls.every(function (el, idx) { return currentFromSlot[idx] === el; });
        if (alreadyCorrect) return;

        // Reverse order, each one inserted right after the anchor (or at
        // the container's front, with no anchor): re-evaluated fresh on
        // every single iteration (NOT a value captured once up front),
        // exactly so each insertion lands before whatever the PREVIOUS
        // iteration just placed there, building up the correct final
        // sequence one element at a time.
        targetEls.slice().reverse().forEach(function (el) {
            const insertBeforeNode = validAnchor ? validAnchor.nextSibling : container.firstChild;
            container.insertBefore(el, insertBeforeNode);
        });
    }

    // FIX for a real, confirmed issue found live, and simplified per the
    // user's own correct observation: with only 2 possible items here,
    // "reordering" is really just "swap or don't swap", nothing more.
    // The old approach reused the generic applyOrder() (designed for
    // zones with many items), which moves tagged items to the
    // container's front -- fine when everything in the container is
    // tagged, but ".headerRight" also holds several other untagged
    // native elements between/around sync and cast (confirmed against
    // the real source: headerSelectedPlayer, headerAudioPlayerButton,
    // headerSearchButton, headerUserButton), so a custom order would
    // have displaced those too. A direct swap between just these two
    // elements, relative to EACH OTHER only, never touches anything
    // else in the header at all.
    function applyTopRightOrder(config) {
        const container = document.querySelector('.headerRight');
        if (!container) return;

        const sync = container.querySelector('.headerSyncButton');
        const cast = container.querySelector('.headerCastButton');
        if (!sync || !cast) return;

        const orderCsv = config.TopRightOrder;
        if (typeof orderCsv !== 'string' || !orderCsv) return;

        const order = orderCsv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        const castIdx = order.indexOf('cast');
        const syncIdx = order.indexOf('sync');
        if (castIdx === -1 || syncIdx === -1) return;
        const wantCastFirst = castIdx < syncIdx;

        const children = Array.prototype.slice.call(container.children);
        const castCurrentlyFirst = children.indexOf(cast) < children.indexOf(sync);

        if (wantCastFirst === castCurrentlyFirst) return;

        // FIX for a real bug found live, confirmed via an actual DOM
        // test: a plain "insertBefore(cast, sync)" doesn't swap two
        // elements in place, it REMOVES cast from wherever it currently
        // is and drops it in front of sync's CURRENT position -- if
        // anything else (here: headerSelectedPlayer,
        // headerAudioPlayerButton) sits BETWEEN sync and cast's original
        // positions, that in-between content gets dragged along/
        // displaced too, confirmed live: ended up after BOTH sync and
        // cast instead of staying between them. A genuine swap captures
        // each element's own original "next sibling" first, moves each
        // element to sit right before the OTHER one's original next
        // sibling, so anything that was originally between them lands
        // exactly where it was, untouched.
        const syncNext = sync.nextSibling;
        const castNext = cast.nextSibling;
        container.insertBefore(sync, castNext);
        container.insertBefore(cast, syncNext);
    }

    // ============================================================
    // JELLYFIN 12.1 MODERN (MUI) VIDEO HEADER
    // ============================================================
    // Same settings as the legacy header above, applied through the CSS
    // flags of ensureCoreStyle(). The title is rendered into the (hidden)
    // legacy h3.pageTitle by applyTitleDisplay() exactly as on 10.10.7 and
    // mirrored into an own element next to the React title, which is
    // hidden; the React title's text is never written to (React would
    // overwrite it on the next title change).
    const MUI_TITLE_CLASS = 'jvosd-tc-mui-title';

    function setRootFlag(name, on) {
        const root = document.documentElement;
        if (on) {
            if (!root.hasAttribute(name)) root.setAttribute(name, '');
        } else if (root.hasAttribute(name)) {
            root.removeAttribute(name);
        }
    }

    // Config-only flags for the first frames of the MUI video header (see
    // ensureCoreStyle()); independent of the OSD state, they match nothing
    // outside the video header.
    function applyMuiPreHides(config) {
        setRootFlag('data-jvosd-pre-hide-back', !!(config && config.HideBackButton));
        setRootFlag('data-jvosd-pre-hide-sync', !!(config && config.HideSyncPlayButton));
        setRootFlag('data-jvosd-pre-hide-cast', !!(config && config.HideCastButton));
    }

    // The MUI video toolbar: 12.1 modern gives it the class videoOsd-appBar;
    // the 10.10.7 "experimental" layout renders the same toolbar (same
    // icons) without any class and without a title; it is recognised by
    // those icons (back / SyncPlay / cast) and by having no drawer menu
    // button (that would be an app toolbar), and gets our own attribute
    // (React leaves attributes it does not manage alone). The legacy
    // layouts have no MUI toolbar at all.
    const MUI_BAR_ATTR = 'data-jvosd-mui-bar';
    const MUI_BAR_ICONS = 'svg[data-testid="ArrowBackIcon"], svg[data-testid="GroupsIcon"], ' +
        'svg[data-testid="CastIcon"], svg[data-testid="CastConnectedIcon"]';

    function getMuiBar() {
        const bar = document.querySelector('.videoOsd-appBar');
        if (bar) return bar;
        const toolbar = Array.prototype.find.call(document.querySelectorAll('.MuiToolbar-root'), function (t) {
            return !t.closest('.dialogContainer') &&
                !!t.querySelector(MUI_BAR_ICONS) &&
                !t.querySelector('svg[data-testid="MenuIcon"]');
        });
        if (toolbar && !toolbar.hasAttribute(MUI_BAR_ATTR)) toolbar.setAttribute(MUI_BAR_ATTR, '');
        return toolbar || null;
    }

    // Marks the header buttons by their MUI icon (independent of the UI
    // language): back, SyncPlay, cast — for the cast-connected state the
    // Box around its button. React re-creates a button on some state
    // changes; the observers call this again and the new node is marked.
    const MUI_BTN_ATTR = 'data-jvosd-mui-btn';

    function markMuiButtons(bar) {
        const marks = [
            ['back', 'button', 'ArrowBackIcon'],
            ['sync', 'button', 'GroupsIcon'],
            ['cast', 'button', 'CastIcon'],
            ['cast', '.MuiBox-root', 'CastConnectedIcon']
        ];
        marks.forEach(function (m) {
            Array.prototype.forEach.call(bar.querySelectorAll('svg[data-testid="' + m[2] + '"]'), function (svg) {
                let el = svg.closest('button');
                if (el && m[1] !== 'button') el = el.parentElement && el.parentElement.closest(m[1]);
                if (el && bar.contains(el) && el !== bar && el.getAttribute(MUI_BTN_ATTR) !== m[0]) {
                    el.setAttribute(MUI_BTN_ATTR, m[0]);
                }
            });
        });
    }

    function applyMuiHeader(config) {
        const bar = isVideoOsdActive() ? getMuiBar() : null;
        const on = !!bar;
        if (bar) markMuiButtons(bar);

        setRootFlag('data-jvosd-mui-hide-back', on && config.HideBackButton);
        setRootFlag('data-jvosd-mui-hide-sync', on && config.HideSyncPlayButton);
        setRootFlag('data-jvosd-mui-hide-cast', on && config.HideCastButton);

        let castFirst = false;
        if (typeof config.TopRightOrder === 'string' && config.TopRightOrder) {
            const order = config.TopRightOrder.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            const castIdx = order.indexOf('cast');
            const syncIdx = order.indexOf('sync');
            castFirst = castIdx !== -1 && syncIdx !== -1 && castIdx < syncIdx;
        }
        setRootFlag('data-jvosd-mui-cast-first', on && castFirst);

        const ownTitle = on && needsTitleIntervention(config);

        const existing = document.querySelectorAll('.' + MUI_TITLE_CLASS);
        const typo = bar && bar.querySelector(':scope > .MuiTypography-root:not(.' + MUI_TITLE_CLASS + ')');
        const source = document.querySelector('h3.' + TITLE_ID);
        if (!ownTitle || config.HideTitleBar || !typo || !source) {
            existing.forEach(function (el) { el.remove(); });
            // The React title is hidden only when nothing is to be shown
            // (HideTitleBar) or the own title replaces it, never while the
            // mirror can't be built yet (no title at all).
            setRootFlag('data-jvosd-mui-own-title', ownTitle && !!config.HideTitleBar);
            return;
        }
        setRootFlag('data-jvosd-mui-own-title', true);

        let mirror = existing[0];
        if (!mirror || mirror.parentNode !== bar || mirror.previousElementSibling !== typo) {
            existing.forEach(function (el) { el.remove(); });
            mirror = document.createElement(typo.tagName.toLowerCase());
            typo.after(mirror);
        }
        const cls = typo.className + ' ' + MUI_TITLE_CLASS;
        if (mirror.className !== cls) mirror.className = cls;
        if (mirror.innerHTML !== source.innerHTML) mirror.innerHTML = source.innerHTML;
    }

    function applyBottomLeftOrder(config) {
        const osdPage = getActiveOsdPage();
        if (!osdPage) return;
        const container = osdPage.querySelector('.videoOsdBottom .buttons.focuscontainer-x > div[dir="ltr"]');
        if (!container) return;

        const idMap = {
            abloop: '#btnAbLoop',
            speed: '.jfb-speed-step-container',
            framebyframe: '.jfb-frame-step-container'
        };
        // FIX for a real, serious bug found live, confirmed via a
        // direct, isolated test: setAttribute() fires a MutationObserver
        // callback EVEN when set to the exact same value it already has
        // (confirmed: an unconditional setAttribute() call, run on every
        // single applyAll() pass regardless of whether anything actually
        // needed to change, kept re-triggering this script's own
        // osdObserver forever, a self-sustaining loop entirely
        // independent of whether applyOrder() itself correctly detected
        // "already correct" -- that check alone was not enough, this
        // was the deeper, actual source). Only calling setAttribute()
        // when the value would genuinely change breaks the cycle at its
        // root.
        Object.keys(idMap).forEach(function (id) {
            const el = container.querySelector(idMap[id]);
            if (el && el.getAttribute('data-jvosd-order-id') !== id) el.setAttribute('data-jvosd-order-id', id);
        });

        // FIX for a real, confirmed issue found live: with no order
        // configured, this fell through to whatever order the 2-3
        // scripts happened to insert themselves in, which is a genuine
        // race (each one's own observer inserts itself into this same
        // container independently, so whichever completes first ends up
        // wherever its own insertion logic puts it), not something
        // guaranteed or stable run to run. TopLeftOrder already has
        // exactly this kind of sensible default fallback
        // (getEpisodeTitleOrder() above), BottomLeftOrder never did.
        // Given the same default here, matching the order the user
        // described as the expected standard. This default is applied
        // through the same reliable, anchor-based applyOrder() logic
        // below regardless of whatever the initial race produced, so
        // it's correct independent of insertion timing either way.
        const orderCsv = (typeof config.BottomLeftOrder === 'string' && config.BottomLeftOrder)
            ? config.BottomLeftOrder
            : 'abloop,speed,framebyframe';

        // The anchor these 3 custom mods should be positioned after:
        // confirmed from the real source and from ABLoop's own script,
        // the last of the native vanilla playback controls in this same
        // container (NextTrack, or FastForward if NextTrack isn't
        // present). Without this, applyOrder() would move the 3 custom
        // items to the absolute front of the WHOLE container, ahead of
        // Play/Pause/Rewind/FastForward/chapter/track, which are also
        // untagged children of this same container, not just the 3
        // custom ones.
        const anchor = container.querySelector('.btnNextTrack') || container.querySelector('.btnFastForward');

        applyOrder(container, orderCsv, 'data-jvosd-order-id', anchor);

        applyCustomGapSpacing(container, config);
    }

    // Per the user's explicit spec, the configured Centered Gap must
    // behave "like the vanilla icons": vanilla spacing is uniform
    // because every native button contributes the same 0.29em per side,
    // so EVERY gap a custom addon participates in must grow by exactly
    // 1x the configured value -- never 2x between two adjacent addons
    // (which is what naive per-element-both-sides margins produce). That
    // requires knowing the actual neighbor, and only this script knows
    // the final order after sorting, so gap application lives HERE, not
    // in the three addon scripts (their own applySpacing() functions now
    // only set the native 0.29em baseline; standalone without the
    // plugin the gap feature doesn't exist anyway). Re-runs on every
    // applyAll() pass, so any reordering immediately re-derives the
    // sides.
    // Ownership rule per addon (Variant 2, the user's final decision,
    // confirmed against two reviewed sketches): its RIGHT side carries
    // the gap only when a right-hand element actually follows in this
    // same container -- the trailing edge of whichever custom happens
    // to be last stays at the native baseline, so the "Ends at" text
    // keeps Jellyfin's own native distance (its 1em margin-left plus
    // our 0.29em base = the native 1.29em) at EVERY configured gap
    // value instead of drifting right with it. Should anything ever be
    // placed after our customs later (a fourth addon, a foreign
    // plugin's button), a right-hand neighbor then exists and that gap
    // starts applying again all by itself. Its LEFT side carries the
    // gap only when the left-hand neighbor is NOT one of our own
    // addons -- if it is, that neighbor's right side already paid for
    // this exact gap. Result: vanilla|addon, addon|vanilla and
    // addon|addon all grow by exactly 1x, never 2x, and the group's
    // outer boundary stays native.
    // ABLoop is a bare button (its 0.29em native baseline lives in its
    // own margins, so the gap is ADDED to 0.29), while Speed/Frame are
    // fixed-width containers whose 0.29em baseline overflows from the
    // inner buttons (so their container margin carries ONLY the gap,
    // cleared entirely at 0). Margins are set conditionally (only on a
    // real change): inline style writes fire MutationObservers even
    // for identical values, and although this script's own osdObserver
    // filters on class attributes only, the addon scripts' own
    // observers watch childList on document.body -- conditional writes
    // keep every pass mutation-free once settled, same lesson as the
    // tagging setAttribute() fix above.
    function applyCustomGapSpacing(container, config) {
        const NATIVE_EM = 0.29;

        function effectiveGap(flagKey, valueKey) {
            return config[flagKey]
                ? (Number(config[valueKey]) || 0)
                : (Number(config.GeneralCenteredGap) || 0);
        }

        const items = [
            {
                el: container.querySelector('#btnAbLoop'),
                gap: effectiveGap('ABLoopIndividualCenteredGapOverride', 'ABLoopCenteredGapValue'),
                bareButton: true
            },
            {
                el: container.querySelector('.jfb-speed-step-container'),
                gap: effectiveGap('SpeedIndividualCenteredGapOverride', 'SpeedCenteredGapValue'),
                bareButton: false
            },
            {
                el: container.querySelector('.jfb-frame-step-container'),
                gap: effectiveGap('FrameByFrameIndividualCenteredGapOverride', 'FrameByFrameCenteredGapValue'),
                bareButton: false
            }
        ].filter(function (i) { return !!i.el; });
        if (!items.length) return;

        const customEls = items.map(function (i) { return i.el; });

        items.forEach(function (i) {
            const prev = i.el.previousElementSibling;
            const next = i.el.nextElementSibling;
            const leftExtra = (prev && customEls.indexOf(prev) === -1) ? i.gap : 0;
            const rightExtra = next ? i.gap : 0;

            let ml, mr;
            if (i.bareButton) {
                ml = (NATIVE_EM + leftExtra) + 'em';
                mr = (NATIVE_EM + rightExtra) + 'em';
            } else {
                ml = leftExtra > 0 ? leftExtra + 'em' : '';
                mr = rightExtra > 0 ? rightExtra + 'em' : '';
            }
            if (i.el.style.marginLeft !== ml) i.el.style.marginLeft = ml;
            if (i.el.style.marginRight !== mr) i.el.style.marginRight = mr;
        });
    }

    // COMPLETE REDESIGN of this zone's sorting (user-approved after the
    // volume slider incident), away from DOM moves onto pure flexbox
    // "order":
    // Root cause that forced this: Jellyfin's emby-slider custom element
    // is NOT move-safe. Confirmed directly from the real source
    // (src/elements/emby-slider/emby-slider.js): its detachedCallback
    // nulls this.backgroundLower/backgroundUpper (the refs behind the
    // blue track fill), and its attachedCallback returns early on
    // re-attach (guarded by data-embyslider="true") WITHOUT restoring
    // them -- and any insertBefore() on an attached node is technically
    // "detach, then re-attach". One single sort-move of the slider
    // therefore froze the blue fill forever, confirmed live by the
    // user. Patching the refs back was explicitly rejected by the user
    // ("kein Draufflicken"); the clean solution is to never move
    // ANYTHING in this zone: ".videoOsdBottom .buttons" is a flex
    // container, and the CSS "order" property changes the VISUAL
    // sequence of flex siblings without any element ever leaving the
    // DOM. No detach, no lost context, nothing to compensate.
    // Consequences, all deliberate:
    // - ".volumeButtons" is NOT dissolved anymore. The slider stays
    //   untouched in its native wrapper (native flex-grow containment,
    //   native 43em narrow-window hide, native hide-mouse-idle-tv all
    //   just keep working); the WRAPPER itself is the sortable
    //   representative for "volumeslider". The former compensation CSS
    //   in ensureCoreStyle() (flex-grow: 0, re-built 43em hide) is
    //   removed again -- with the native context intact there is
    //   nothing left to compensate. Only a uniform 0.29em side margin
    //   replaces the wrapper's native asymmetric "0 1em 0 0.29em",
    //   which was designed for its one fixed vanilla position and
    //   would look lopsided at arbitrary sorted positions.
    // - Only .buttonMute still leaves the wrapper, ONCE, so it stays
    //   independently sortable. Plain emby buttons are proven
    //   move-safe (their attachedCallback re-binds on every re-attach,
    //   verified against emby-ratingbutton/emby-button source). It gets
    //   hide-mouse-idle-tv re-applied since that lived on the wrapper.
    // - Untagged siblings (the left transport group and ".osdTimeText")
    //   keep the flex default order 0 and therefore always render
    //   BEFORE everything we number from 1 upward: the "Ends at" spacer
    //   stays first without needing any anchor logic at all.
    // - Known edge, documented on purpose: a FOREIGN element some other
    //   plugin appends to this container also has order 0 and would
    //   visually line up before our numbered items; not touched here
    //   because blanket-styling unknown elements is worse.
    // - Known, openly stated trade-off (user accepted): keyboard Tab
    //   order follows the DOM, i.e. the vanilla sequence, not the
    //   sorted visual sequence.
    // - Loop safety: style.order writes are attribute mutations, which
    //   this script's own osdObserver ignores (attributeFilter:
    //   ['class']) and the addon scripts' childList observers never
    //   see; all writes below are additionally change-guarded, so a
    //   settled state produces zero mutations.
    function applyBottomRightOrder(config) {
        // Scoped to the live OSD page (see getActiveOsdPage()): a bare
        // document-wide '.btnUserRating' also matches the favorite button
        // of a cached item details page (itemDetails/index.html), which
        // then got sorted instead of the OSD whenever that page sat in
        // an earlier slot.
        const osdPage = getActiveOsdPage();
        if (!osdPage) return;
        const favBtn = osdPage.querySelector('.videoOsdBottom .btnUserRating');
        const container = favBtn && favBtn.parentNode;
        if (!container) return;

        // Mute moves out of the wrapper exactly once (guarded: only
        // while it still sits inside), gaining independent sortability;
        // the wrapper-provided TV auto-hide is re-applied directly.
        const wrapper = container.querySelector('.volumeButtons');
        if (wrapper) {
            const muteInWrapper = wrapper.querySelector('.buttonMute');
            if (muteInWrapper) {
                wrapper.insertAdjacentElement('afterend', muteInWrapper);
            }
        }
        const mute = container.querySelector('.buttonMute');
        if (mute && !mute.classList.contains('hide-mouse-idle-tv')) mute.classList.add('hide-mouse-idle-tv');

        // "volumeslider" = the native ".volumeButtons" wrapper (the slider;
        // mute is moved out of it above). Present in 10.10.7 and 12.x.
        const idMap = {
            favorite: '.btnUserRating',
            episodepreview: '#popupPreviewButton',
            subtitles: '.btnSubtitles',
            audio: '.btnAudio',
            mute: '.buttonMute',
            volumeslider: '.volumeButtons',
            settings: '.btnVideoOsdSettings',
            pip: '.btnPip',
            fullscreen: '.btnFullscreen',
            airplay: '.btnAirPlay',
            download: '.btnDownload',
            screenshot: '.btnScreenshot'
        };

        // Same sensible default fallback as before: 3 of the 12 items
        // (download, screenshot, episodepreview) are dynamically
        // inserted by separate scripts, so with nothing configured
        // their raw insertion order would be a race.
        const orderCsv = (typeof config.BottomRightOrder === 'string' && config.BottomRightOrder)
            ? config.BottomRightOrder
            : 'screenshot,download,favorite,episodepreview,subtitles,audio,mute,volumeslider,settings,airplay,pip,fullscreen';
        const order = orderCsv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

        Object.keys(idMap).forEach(function (id) {
            const el = container.querySelector(idMap[id]);
            if (!el) return;
            if (el.getAttribute('data-jvosd-order-id') !== id) el.setAttribute('data-jvosd-order-id', id);
            const idx = order.indexOf(id);
            const val = idx === -1 ? '' : String(idx + 1);
            if (el.style.order !== val) el.style.order = val;
        });
    }

    // ============================================================
    // ORCHESTRATION
    // ============================================================
    let currentConfig = null;
    let currentItemInfo = null;
    // Native title text the current item info belongs to (see
    // applyTitleDisplay()); null = no title seen yet on this OSD visit.
    let titleRawTextForItemInfo = null;
    let itemInfoRequestSeq = 0;

    function applyAll() {
        if (!currentConfig) return;
        ensureCoreStyle();
        applyOsdInternalHides(currentConfig);
        applyHeaderButtonHides(currentConfig);
        applyTitleDisplay(currentConfig, currentItemInfo);
        applyTopRightOrder(currentConfig);
        applyMuiPreHides(currentConfig);
        applyMuiHeader(currentConfig);
        applyBottomLeftOrder(currentConfig);
        applyBottomRightOrder(currentConfig);
    }

    // The server's session can still report the previous item for a
    // moment after the next one started, so the fetched info is only
    // used once its item name is part of the native title actually on
    // screen (retried briefly). A newer request supersedes an older one.
    // Jellyfin's own title text currently on screen (not our rebuilt one).
    function getNativeTitleText() {
        const el = document.querySelector('h3.' + TITLE_ID);
        if (!el) return '';
        return el.getAttribute(RAW_TEXT_MARKER_ATTR) === el.textContent
            ? (el.dataset.jvosdTcSourceText || '')
            : el.textContent;
    }

    // Jellyfin sets the favorite button's data-id to the current item in
    // the same step as the title, so the item Id is the reliable check
    // (a name check alone accepted "Toy Story" for "Toy Story 2"). Items
    // that can't be rated have no data-id; the name check is used then.
    function itemInfoMatchesOsd(info, titleText) {
        const osdPage = getActiveOsdPage();
        const ratingBtn = osdPage && osdPage.querySelector('.btnUserRating');
        const liveId = ratingBtn && ratingBtn.getAttribute('data-id');
        if (liveId && info.id) return info.id === liveId;
        return !info.name || info.type === 'TvChannel' || titleText.includes(info.name);
    }

    async function refreshItemInfoAndReapply() {
        const seq = ++itemInfoRequestSeq;
        for (let attempt = 0; attempt < 8; attempt++) {
            const info = await getNowPlayingItemInfo();
            if (seq !== itemInfoRequestSeq) return;
            // No title yet (Jellyfin sets it right after the page shows):
            // retry rather than accept info that can't be checked. Live TV
            // titles show the program, not the channel item's name, so the
            // name check can't apply there.
            const titleText = getNativeTitleText();
            if (info && titleText && itemInfoMatchesOsd(info, titleText)) {
                currentItemInfo = info;
                applyAll();
                return;
            }
            await new Promise(function (resolve) { setTimeout(resolve, 500); });
            if (seq !== itemInfoRequestSeq) return;
        }
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
    let observedOsdPage = null;

    function startOsdObserver() {
        const osdPage = getActiveOsdPage();
        if (!osdPage) return;
        if (osdObserver && observedOsdPage === osdPage) {
            startMuiObserver();
            return;
        }
        stopOsdObserver();
        observedOsdPage = osdPage;
        osdObserver = new MutationObserver(function () {
            applyAll();
        });
        osdObserver.observe(osdPage, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        startMuiObserver();
    }

    function stopOsdObserver() {
        stopMuiObserver();
        if (!osdObserver) return;
        osdObserver.disconnect();
        osdObserver = null;
        observedOsdPage = null;
    }

    // Jellyfin 12.1 modern: the MUI video header and the legacy title it is
    // mirrored from live OUTSIDE #videoOsdPage, so the observer above never
    // sees them. When the header mounts or the title arrives after the
    // config (slow devices), nothing inside the OSD page changes on a paused
    // video and the header settings stayed unapplied. This observer watches
    // the header box (or, until it exists, the body for its arrival) and the
    // legacy title while the OSD is active; applyMuiHeader() only writes on
    // a difference, so its own changes settle at once.
    const MUI_WAIT_MS = 5000;
    let muiObserver = null;
    let muiObserverTarget = null;
    let muiObserverTimer = null;

    function startMuiObserver() {
        if (!isVideoOsdActive()) return;
        const bar = getMuiBar();
        const target = bar ? (bar.closest('.osdHeader') || bar.parentNode) : document.body;
        if (muiObserver && muiObserverTarget === target) return;
        stopMuiObserver();
        muiObserverTarget = target;
        muiObserver = new MutationObserver(function () {
            if (!currentConfig) return;
            if (!bar && getMuiBar()) {
                // The header has mounted: narrow the watch to it.
                startMuiObserver();
            }
            applyTitleDisplay(currentConfig, currentItemInfo);
            applyMuiHeader(currentConfig);
        });
        muiObserver.observe(target, { childList: true, subtree: true, characterData: !!bar });
        const title = document.querySelector('h3.' + TITLE_ID);
        if (bar && title) muiObserver.observe(title, { childList: true, subtree: true, characterData: true });
        if (!bar) {
            // Legacy layouts and 10.10.7 never mount this header: stop
            // waiting for it after a few seconds.
            muiObserverTimer = setTimeout(function () {
                if (muiObserverTarget === document.body) stopMuiObserver();
            }, MUI_WAIT_MS);
        }
    }

    function stopMuiObserver() {
        if (muiObserverTimer) {
            clearTimeout(muiObserverTimer);
            muiObserverTimer = null;
        }
        if (!muiObserver) return;
        muiObserver.disconnect();
        muiObserver = null;
        muiObserverTarget = null;
    }

    // CONFIG CACHE for instant, pre-paint layout (user-approved after
    // theory check and simulation): the fresh fetch below is a network
    // round trip that resolves in a LATER task, so between the page's
    // first paint and that resolution the user briefly saw the vanilla
    // arrangement re-shuffle into the configured one. The cache removes
    // that window: Jellyfin makes the page visible and dispatches
    // 'pageshow' within one synchronous chain (verified in the real
    // source: viewContainer.js "classList.remove('hide')" ->
    // viewManager.js "dispatchEvent('pageshow')"), and browsers only
    // paint after the current task INCLUDING its microtasks has fully
    // drained -- so everything applied synchronously inside the
    // pageshow handler is guaranteed on screen from the very first
    // painted frame. Pattern: stale-while-revalidate. The cached copy
    // is applied instantly, the live fetch (unchanged, still every
    // video start) refreshes the cache and re-applies; since every
    // write in applyAll() is change-guarded, an identical fresh config
    // causes zero mutations. Known, accepted trade-off: the first
    // video right after an admin-panel change briefly shows the
    // previously cached arrangement, then corrects; the very next
    // video is instant again (cache self-heals because the fetch runs
    // per video start). All storage access is try/catch-guarded:
    // without usable localStorage (or with a corrupted entry) behavior
    // degrades exactly to the previous fetch-only flow, never worse.
    // Plugin config is server-wide (not per-user) and localStorage is
    // per-origin (per server), so a shared cache is always
    // content-correct.
    const CONFIG_CACHE_KEY = 'jvosd-tc-config-cache';

    function readCachedConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeCachedConfig(cfg) {
        try {
            localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg));
        } catch (e) {
            /* storage unavailable or full: degrade to fetch-only */
        }
    }

    function onVideoOsdShow() {
        // Item info always belongs to one item; a new OSD visit starts
        // without it (the fetch below brings the current one).
        currentItemInfo = null;
        titleRawTextForItemInfo = null;
        itemInfoRequestSeq++;
        // Synchronous cache pass FIRST: runs to completion inside the
        // pageshow dispatch, i.e. before the first paint (see the
        // comment block above). applyAll() deliberately depends on
        // nothing asynchronous (verified: no ApiClient usage), and
        // startOsdObserver() is idempotent, so the fetch path below
        // calling both again is harmless.
        const cached = readCachedConfig();
        if (cached) {
            currentConfig = cached;
            applyAll();
            startOsdObserver();
        }

        // FIX for a real gap found live: this used to just reuse
        // currentConfig, which was only ever fetched ONCE at the very
        // first script load. If the admin changed a Hide/reorder setting
        // and saved it, then navigated to a video WITHOUT a full page
        // reload in between (e.g. just navigating within the single-page
        // app), the OLD configuration was still what got applied, not
        // the one just saved. Re-fetching fresh every time the video OSD
        // becomes active fixes this: fetchPluginConfig() resolves nearly
        // immediately once window.ApiClient exists (which it always does
        // by this point, well after initial page load), so this adds no
        // meaningful delay in the common case. It doubles as the cache
        // refresh for the mechanism above.
        fetchPluginConfig().then(function (pluginConfig) {
            if (!pluginConfig) {
                // No fresh config (e.g. non-admin: the endpoint is
                // admin-only). The cached config applied above still needs
                // the current item's info.
                if (currentConfig) refreshItemInfoAndReapply();
                return;
            }
            writeCachedConfig(pluginConfig);
            currentConfig = pluginConfig;
            applyAll();
            refreshItemInfoAndReapply();
            startOsdObserver();
        }).catch(function (err) {
            console.error('[VideoOSD Tweaks and Candy] Core init failed:', err);
        });
    }

    function onVideoOsdHide(page) {
        stopOsdObserver();
        // Re-run once more so the header elements (Back/Title/Sync/Cast)
        // correctly un-hide again now that we've left the video page,
        // isVideoOsdActive() inside applyHeaderButtonHides()/
        // applyTitleDisplay() picks up the new state on its own.
        // The page being left is excluded explicitly, it may not carry
        // "hide" yet (see leavingOsdPage).
        leavingOsdPage = page;
        try {
            applyAll();
        } finally {
            leavingOsdPage = null;
        }
    }

    document.addEventListener('pageshow', function (e) {
        if (e.target && e.target.id === OSD_PAGE_ID) {
            onVideoOsdShow();
        }
    });

    document.addEventListener('pagehide', function (e) {
        if (e.target && e.target.id === OSD_PAGE_ID) {
            onVideoOsdHide(e.target);
        }
    });

    // Catches the case where the video OSD was already active by the
    // time this script's listeners above got attached (e.g. a page
    // refresh while a video was already playing), so its own earlier
    // "pageshow" event (which fired before we were listening yet) wasn't
    // missed. onVideoOsdShow() does its own fresh config fetch, no need
    // to duplicate that here.
    if (isVideoOsdActive()) {
        onVideoOsdShow();
    } else {
        // Before the first video: the header can mount before "pageshow".
        // The cached config covers a returning browser at once; one fetch
        // per page load covers the first visit and a config saved since (the
        // same endpoint the OSD visit uses). Signed out (login page) nothing
        // is sent and no timer runs: the fetch waits for the first view
        // change ("viewshow", both versions' viewManager) or hash change
        // with a token.
        ensureCoreStyle();
        applyMuiPreHides(readCachedConfig());
        let preHideFetchStarted = false;
        const startPreHideFetch = function () {
            if (preHideFetchStarted) return;
            if (!window.ApiClient || typeof ApiClient.accessToken !== 'function' || !ApiClient.accessToken()) return;
            preHideFetchStarted = true;
            document.removeEventListener('viewshow', startPreHideFetch, true);
            window.removeEventListener('hashchange', startPreHideFetch);
            fetchPluginConfig().then(function (pluginConfig) {
                if (!pluginConfig) return;
                writeCachedConfig(pluginConfig);
                applyMuiPreHides(pluginConfig);
            }).catch(function () { /* the OSD visit fetches again */ });
        };
        startPreHideFetch();
        if (!preHideFetchStarted) {
            document.addEventListener('viewshow', startPreHideFetch, true);
            window.addEventListener('hashchange', startPreHideFetch);
        }
    }
})();
