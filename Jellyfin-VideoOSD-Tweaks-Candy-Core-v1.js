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
        // FIX for a real, confirmed bug found live: applyBottomRightOrder()
        // deliberately extracts .buttonMute and .osdVolumeSliderContainer
        // out of their shared ".volumeButtons" wrapper so both can be
        // sorted independently, but the wrapper wasn't just a grouping
        // element -- it was a CSS containment context. Confirmed against
        // the real source (src/styles/videoosd.scss, 10.10):
        //   .osdVolumeSliderContainer { width: 9em; flex-grow: 1; }
        // Inside the tiny ".volumeButtons" flex wrapper "flex-grow: 1"
        // had almost no free space to claim, so the slider stayed ~9em.
        // As a direct child of the big ".buttons" flex row it suddenly
        // claims ALL free space of the entire bar, stretching across the
        // full width -- confirmed live by the user's screenshot. The
        // first rule below neutralizes flex-grow ONLY in the extracted
        // state (direct-child selector: vanilla keeps the slider nested
        // inside .volumeButtons, where this selector can never match),
        // and gives the slider the same 0.29em side spacing every
        // paper-icon-button-light neighbor carries.
        // The wrapper also carried the narrow-window auto-hide
        // (real source: "@media all and (max-width: 43em)
        // { .videoOsdBottom .volumeButtons { display: none !important } }").
        // Once extracted, mute and slider would wrongly stay visible on
        // narrow windows; the media rule below re-applies that same
        // behavior to both extracted elements, again via direct-child
        // selectors so vanilla stays untouched.
        style.textContent = `.${FORCE_HIDE_CLASS} { display: none !important; }
.jvosd-tc-title-sep { margin: 0 0.35em; }
.jvosd-tc-title-year-sep { margin-left: 0.35em; }
.videoOsdBottom .buttons > .osdVolumeSliderContainer { flex-grow: 0; margin: 0 0.29em; }
@media all and (max-width: 43em) {
    .videoOsdBottom .buttons > .buttonMute,
    .videoOsdBottom .buttons > .osdVolumeSliderContainer { display: none !important; }
}`;
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
        // Gated the same way applyHeaderButtonHides() is: h3.pageTitle is
        // the SAME shared header title element on every single page
        // site-wide, not just the video OSD.
        if (!isVideoOsdActive()) return;

        const el = document.querySelector('h3.' + TITLE_ID);
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
        const itemInfoSignature = (itemInfo?.kind || '') + '\u0000' + (itemInfo?.originalTitle || '');
        const renderSignature = rawText + '\u0001' + itemInfoSignature + '\u0001' + (config.HideTitleBar ? '1' : '0');
        if (el.dataset.jvosdTcLastRenderSignature === renderSignature) return;
        el.dataset.jvosdTcLastRenderSignature = renderSignature;

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
            // FIX for a real behavior gap the user pointed out: this used
            // to APPEND the original title next to the normal one
            // ("Title - OriginalTitle"), matching the field's literal
            // description text ("Adds the ... original title next to its
            // title") but not what the user actually wants: the original
            // title should REPLACE the normal title entirely, falling
            // back to the normal title if no original title exists (or
            // is identical to it, nothing meaningful to switch to).
            const displayName = (kind === 'movie' && config.ShowOriginalTitleMovies && itemInfo?.originalTitle && itemInfo.originalTitle !== parsed.name)
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

    function applyBottomLeftOrder(config) {
        const container = document.querySelector('.videoOsdBottom .buttons.focuscontainer-x > div[dir="ltr"]');
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
            if (el && el.getAttribute('data-jvosd-order-id') !== id) el.setAttribute('data-jvosd-order-id', id);
        });

        // FIX for a real, confirmed bug found live: .buttonMute and
        // .osdVolumeSliderContainer sit nested inside their own shared
        // wrapper (confirmed from the real source: a ".volumeButtons"
        // div contains both), not as direct children of this container.
        // Reordering them via container.insertBefore() (which any actual
        // repositioning below would do) would silently rip them straight
        // out of that wrapper, leaving it empty. Per the user's own
        // correct observation, Hide already treats these two completely
        // independently (each has its own separate toggle), so Sort
        // should too, not be artificially restricted to move them only
        // as a pair. ".volumeButtons" carries "hide-mouse-idle-tv"
        // (confirmed from the real source: hides the group on
        // TV-idle-mouse), which lives on the WRAPPER, not on either
        // child individually, so extracting them loses that behavior
        // unless it's re-applied directly to each -- done here,
        // unconditionally, before any reordering happens, so sorting
        // these two anywhere else (with other items between them, or
        // relative to each other) fully works while this TV-specific
        // auto-hide still applies to each of them on its own.
        const mute = container.querySelector('.buttonMute');
        const volumeSlider = container.querySelector('.osdVolumeSliderContainer');
        if (mute && !mute.classList.contains('hide-mouse-idle-tv')) mute.classList.add('hide-mouse-idle-tv');
        if (volumeSlider && !volumeSlider.classList.contains('hide-mouse-idle-tv')) volumeSlider.classList.add('hide-mouse-idle-tv');

        // FIX for a real, serious bug found live, confirmed via an
        // actual MutationObserver instrumentation: once mute/slider get
        // pulled out of ".volumeButtons" (immediately below, or on any
        // earlier pass), the now-empty wrapper div was left behind,
        // sitting in the DOM as an untagged leftover. Every subsequent
        // applyOrder() call's own "is this already correct" position
        // check walked right past this leftover empty div without
        // accounting for it, so it could never actually confirm a
        // stable, settled state, meaning it kept re-running its full
        // reordering logic on literally every single observer tick,
        // and each of THOSE reordering passes is itself a real DOM
        // mutation, feeding right back into triggering the observer
        // again -- an unbroken, self-sustaining loop, confirmed live:
        // over 500 observer firings and still climbing before this fix.
        const oldWrapper = document.querySelector('.volumeButtons');
        if (oldWrapper && !oldWrapper.children.length) {
            oldWrapper.remove();
        }

        // FIX, same class of issue as applyBottomLeftOrder() above: 3 of
        // these 12 items (download, screenshot, episodepreview) are
        // dynamically inserted by their own separate scripts (or a
        // separate third-party plugin, for episodepreview), so their
        // position relative to each other is a similar race with nothing
        // configured. The other 9 are native, fixed-position elements not
        // affected by this, but for consistency, this zone gets the same
        // kind of sensible default fallback, matching this project's own
        // established default listing order.
        const orderCsv = (typeof config.BottomRightOrder === 'string' && config.BottomRightOrder)
            ? config.BottomRightOrder
            : 'screenshot,download,favorite,episodepreview,subtitles,audio,mute,volumeslider,settings,airplay,pip,fullscreen';

        // FIX for a real bug found live: ".osdTimeText" ("Ends At") is an
        // untagged sibling in this exact same container (confirmed from
        // the real source), not part of any order list, but without an
        // anchor, applyOrder() would move any of the 12 tagged items
        // ahead of it, confirmed live via an actual test: it ended up
        // displaced to position 3 instead of staying first. Beyond just
        // looking wrong, this breaks its own "margin-right: auto" flex
        // spacer role (see applyOsdInternalHides()'s own comment on
        // HideEndsAtInfo) if its position shifts. Anchored the same way
        // Bottom-Left's native buttons are: everything in this order
        // list is positioned after it, its own place stays untouched.
        const anchor = container.querySelector('.osdTimeText');

        applyOrder(container, orderCsv, 'data-jvosd-order-id', anchor);
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
        // meaningful delay in the common case.
        fetchPluginConfig().then(function (pluginConfig) {
            if (!pluginConfig) return;
            currentConfig = pluginConfig;
            applyAll();
            refreshItemInfoAndReapply();
            startOsdObserver();
        }).catch(function (err) {
            console.error('[VideoOSD Tweaks and Candy] Core init failed:', err);
        });
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

    // Catches the case where the video OSD was already active by the
    // time this script's listeners above got attached (e.g. a page
    // refresh while a video was already playing), so its own earlier
    // "pageshow" event (which fired before we were listening yet) wasn't
    // missed. onVideoOsdShow() does its own fresh config fetch, no need
    // to duplicate that here.
    if (isVideoOsdActive()) {
        onVideoOsdShow();
    }
})();
