// NAME: Letras en pantalla
// VERSION: 1.1.0
// DESCRIPTION: Letras nativas, portadas y controles en pantalla completa.

(() => {
  "use strict";

  const root = document.documentElement;
  if (root.dataset.lepLoaded) return;
  root.dataset.lepLoaded = "true";

  const TITLE = "Letras en pantalla";
  const KEY = "letras-en-pantalla:config";
  const NATIVE_FULL = 'button[data-testid="fullscreen-mode-button"]';
  const NATIVE_LYRICS = 'button[data-testid="lyrics-button"], button.main-nowPlayingBar-lyricsButton';
  const WIDGET = '[data-testid="now-playing-widget-v2"], [data-testid="now-playing-widget"], .main-nowPlayingWidget-nowPlaying';
  const TRACK_LINK = '[data-testid="context-item-link"], a[href^="/track/"], a[href^="/episode/"]';
  const ARTIST_LINK = '[data-testid="context-item-info-artist"], a[href^="/artist/"], a[href^="/show/"]';
  const SOURCE = '.lyrics-lyrics-container, [data-testid="lyrics-container"], .lyrics-lyrics-contentWrapper';
  const LINE = '.lyrics-lyricsContent-lyric, [data-testid="lyrics-line"]';
  const TEXT = ".lyrics-lyricsContent-text";
  const ACTIVE = '.lyrics-lyricsContent-active, [aria-current="true"], [data-active="true"], [data-current="true"]';
  const SEEKABLE = '.lyrics-lyricsContent-isInteractive, button, [role="button"]';
  const PREVIEW = '[data-testid="lyrics-npv-section"]';
  const PROVIDER = ".lyrics-lyricsContent-provider";
  const DRAWINGS = {
    stage: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M8 10h8m-8 4h8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M5 6v12m14-12-9 6 9 6Z" fill="currentColor"/>',
    next: '<path d="M19 6v12M5 6l9 6-9 6Z" fill="currentColor"/>',
    play: '<path d="m9 5 11 7-11 7Z" fill="currentColor"/>',
    pause: '<path d="M9 5v14m6-14v14" stroke-width="3"/>',
    tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--lep-bg)"/><circle cx="15" cy="17" r="2" fill="var(--lep-bg)"/>',
  };
  const icon = (name, size = 22) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DRAWINGS[name] + '</svg>';
  const motionPreference = matchMedia("(prefers-reduced-motion: no-preference)");
  const settings = { layout: "both", palette: "album", size: "standard", motion: true, follow: true, native: true, style: true, glass: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const key of ["motion", "follow", "native", "style", "glass"]) {
      if (typeof saved?.[key] === "boolean") settings[key] = saved[key];
    }
    if (["cover", "lyrics", "both"].includes(saved?.layout)) {
      settings.layout = saved.layout;
      if (["album", "mora", "oceano", "tinta"].includes(saved.palette)) settings.palette = saved.palette;
    }
    if (["compact", "standard", "large"].includes(saved?.size)) settings.size = saved.size;
  } catch { /* Storage can be disabled. */ }

  let stage;
  let opening = false;
  let player;
  let history;
  let playbar;

  function applySettings() {
    root.dataset.lepStyle = String(settings.style);
    root.dataset.lepSize = settings.size;
    root.dataset.lepMotion = String(settings.motion);
    if (!stage) return;
    stage.dialog.dataset.palette = settings.palette;
    stage.dialog.dataset.glass = String(settings.glass);
    stage.dialog.dataset.layout = settings.layout;
    stage.ui.track.hidden = settings.layout === "lyrics";
    stage.ui.lyrics.hidden = settings.layout === "cover";
    stage.ui.followControl.hidden = settings.layout === "cover";
    stage.ui.follow.checked = settings.follow;
    for (const field of stage.ui.layout.elements) field.checked = field.value === settings.layout;
    highlight(stage, settings.follow);
  }

  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Keep session preferences. */ }
    applySettings();
  }

  function track(eventState) {
    const states = [eventState, player.origin?._state, player.data].filter(Boolean);
    const items = states.map((state) => state.item || state.track || state.currentTrack).filter(Boolean);
    const item = items[0];
    const meta = item?.metadata ?? {};
    const widget = document.querySelector(WIDGET);
    const link = widget?.querySelector(TRACK_LINK);
    const media = navigator.mediaSession?.metadata;
    const widgetTitle = link?.textContent?.trim() || link?.getAttribute("title") || "";
    const visibleUri = /\/(track|episode)\/([a-z0-9]+)/i.exec(link?.getAttribute("href") || "");
    const uri = item?.uri || (visibleUri ? ["spotify", ...visibleUri.slice(1)].join(":") : "");
    const album = /^spotify:album:([a-z0-9]{22})$/i.exec(meta.album_uri || item?.album?.uri || "") ||
      /\/album\/([a-z0-9]{22})(?:[/?#]|$)/i.exec(link?.getAttribute("href") || "");
    const title = meta.title || item?.name || item?.title || widgetTitle || media?.title || "";
    const mediaMatches = !title || !media?.title || title === media.title;
    const artists = item?.artists?.map?.((artist) => artist?.name).filter(Boolean).join(", ") ||
      Object.keys(meta).filter((key) => /^artist_name(?::\d+)?$/.test(key)).map((key) => meta[key]).filter(Boolean).join(", ") ||
      (widget && [...widget.querySelectorAll(ARTIST_LINK)].map((node) => node.textContent.trim()).filter(Boolean).join(", ")) ||
      (mediaMatches ? media?.artist : "") || "";
    const widgetCover = widget?.querySelector('img[data-testid="cover-art-image"], [data-testid="cover-art-image"] img, img');
    const mediaArt = mediaMatches ? [...(media?.artwork ?? [])].reverse().map(({ src }) => src) : [];
    const albumArt = [...(item?.album?.images ?? [])].sort((a, b) => (b.width || 0) - (a.width || 0)).map(({ url }) => url);
    const art = [meta.image_xlarge_url, meta.image_large_url, ...albumArt, ...mediaArt, meta.image_url,
      widgetCover?.currentSrc, widgetCover?.src].map(artwork).find(Boolean) || "";
    const ad = states.some((state) => state.is_ad || state.isAd) || /^spotify:ad(?::|$)/.test(uri) ||
      item?.type === "ad" || meta.entity_type === "ad" || [meta.is_ad, meta.is_advertisement].some((value) => value === true || value === "true");
    return { uri, ad, title, artists, art, albumId: album?.[1] || "" };
  }

  function artwork(value) {
    if (typeof value !== "string") return "";
    if (/^spotify:image:[a-f0-9]{40}$/i.test(value)) return "https://i.scdn.co/image/" + value.slice(14);
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password &&
          (url.hostname.endsWith(".scdn.co") || url.hostname.endsWith(".spotifycdn.com"))) return url.href;
    } catch { /* Optional image. */ }
    return "";
  }

  function fullSizeCover(source) {
    const url = new URL(source);
    // Spotify's public album-image service exposes the same image at several sizes.
    const albumImage = /(?:^|\/)ab67616d[0-9a-f]{8}([0-9a-f]{24})(?:\/|$)/i.exec(url.pathname);
    return albumImage ? "https://i.scdn.co/image/ab67616d0000b273" + albumImage[1] : url.href;
  }

  async function tryAlbumCover(state) {
    const albumId = state.track?.albumId;
    if (!albumId || state.coverAlbum === albumId) return;
    state.coverAlbum = albumId;
    const request = new URL("https://open.spotify.com/oembed");
    request.searchParams.set("url", "https://open.spotify.com/album/" + albumId);
    try {
      const response = await fetch(request, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: state.controller.signal,
      });
      if (!response.ok) return;
      const result = await response.json();
      const thumbnail = artwork(result.thumbnail_url);
      if (!thumbnail || stage !== state || state.track?.albumId !== albumId) return;
      const cover = fullSizeCover(thumbnail);
      if (state.ui.cover.src !== cover) {
        state.ui.cover.crossOrigin = "anonymous";
        state.ui.cover.src = cover;
      }
    } catch {
      // The native artwork stays usable when Spotify does not return a larger image.
    }
  }

  function setAmbient(state, cover) {
    if (stage !== state || !cover.naturalWidth) return;
    cover.hidden = false;
    const canvas = document.createElement("canvas");
    const size = 16;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let pixels;
    try {
      context.drawImage(cover, 0, 0, size, size);
      pixels = context.getImageData(0, 0, size, size).data;
    } catch {
      // Some artwork hosts allow display without granting pixel access.
      return;
    }
    const swatches = [
      averageColor(pixels, 0, size / 2),
      averageColor(pixels, size / 2, size),
    ];
    const colors = swatches.map(([hue, saturation], index) =>
      "hsl(" + hue + " " + Math.max(12, saturation) + "% " + (index ? 24 : 33) + "%)");
    const dialog = state.dialog;
    const signature = colors.join("/");
    if (dialog.dataset.colors === signature) return;
    dialog.dataset.colors = signature;
    dialog.style.setProperty("--lep-art-main", colors[0]);
    dialog.style.setProperty("--lep-art-secondary", colors[1]);
    state.artworkAnimation?.cancel();
    if (settings.palette === "album" && settings.motion && motionPreference.matches && state.ui.ambient.animate) {
      state.artworkAnimation = state.ui.ambient.animate([{ opacity: 0.65 }, { opacity: 1 }], {
        duration: 420,
        easing: "ease-out",
      });
    }

    function averageColor(data, start, end) {
      const channels = [0, 0, 0];
      let sum = 0;
      for (let y = 0; y < size; y++) {
        for (let x = start; x < end; x++) {
          const i = (y * size + x) * 4;
          const high = Math.max(data[i], data[i + 1], data[i + 2]);
          const low = Math.min(data[i], data[i + 1], data[i + 2]);
          const weight = (0.08 + (high - low) / 255) * (data[i + 3] / 255);
          for (let channel = 0; channel < 3; channel++) channels[channel] += data[i + channel] * weight;
          sum += weight;
        }
      }
      const [red, green, blue] = channels.map((value) => sum ? value / sum / 255 : 0);
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const span = max - min;
      if (span < 0.035) return [235, 2];
      const sector = max === red ? (green - blue) / span :
        max === green ? 2 + (blue - red) / span : 4 + (red - green) / span;
      return [Math.round((sector * 60 + 360) % 360), Math.round(Math.min(77, 22 + span * 86))];
    }
  }

  function render(entered, nativeView) {
    const dialog = document.createElement("dialog");
    dialog.id = "lep-dialog";
    dialog.setAttribute("aria-labelledby", "lep-title");
    dialog.innerHTML = `
      <div class="lep-ambient" data-ui="ambient" aria-hidden="true"></div>
      <header class="lep-header">
        <h1 id="lep-title" class="lep-sr">Letras en pantalla</h1>
        <fieldset class="lep-layout lep-glass" data-ui="layout">
          <legend class="lep-sr">Vista</legend>
          <label><input type="radio" name="lep-layout" value="cover">Portada</label>
          <label><input type="radio" name="lep-layout" value="both">Ambas</label>
          <label><input type="radio" name="lep-layout" value="lyrics">Letra</label>
        </fieldset>
        <div class="lep-actions">
          <button type="button" class="lep-icon lep-glass" data-ui="tune" aria-label="Ajustes" title="Ajustes" aria-expanded="false" aria-controls="lep-options">${icon("tune", 20)}</button>
          <button type="button" class="lep-icon lep-glass" data-ui="exit" aria-label="Salir de pantalla completa" title="Salir (Esc)" autofocus>${icon("close", 20)}</button>
        </div>
      </header>
      <div class="lep-body">
        <section class="lep-track" data-ui="track" aria-label="Portada del álbum">
          <div class="lep-cover"><img data-ui="cover" alt="" decoding="async" referrerpolicy="no-referrer" hidden></div>
        </section>
        <section class="lep-lyrics" data-ui="lyrics" aria-label="Letra">
          <div class="lep-scroll" data-ui="scroll" tabindex="0" aria-label="Versos">
            <p class="lep-status" data-ui="status" role="status"></p>
            <div data-ui="lines" class="lep-lines" hidden></div>
          </div>
          <footer class="lep-credit" data-ui="credit" hidden></footer>
        </section>
      </div>
      <footer class="lep-dock lep-glass">
        <div class="lep-identity">
          <h2 data-ui="title"></h2><p data-ui="artist"></p>
        </div>
        <div class="lep-playback">
          <div class="lep-transport" aria-label="Controles de reproducción">
            <button type="button" class="lep-icon" data-ui="back" aria-label="Anterior">${icon("back")}</button>
            <button type="button" class="lep-play" data-ui="play" aria-label="Reproducir">${icon("play")}</button>
            <button type="button" class="lep-icon" data-ui="next" aria-label="Siguiente">${icon("next")}</button>
          </div>
          <div class="lep-position">
            <span data-ui="elapsed">0:00</span>
            <input type="range" min="0" max="0" value="0" step="1" data-ui="position" aria-label="Posición de reproducción">
            <span data-ui="duration">0:00</span>
          </div>
        </div>
        <label class="lep-follow" data-ui="followControl"><input data-ui="follow" type="checkbox"> Seguir letra</label>
      </footer>
      <section class="lep-options lep-glass" id="lep-options" data-ui="options" aria-label="Ajustes" hidden>
        <label>Fondo <select data-setting="palette" aria-label="Fondo"><option value="album">Colores de la portada</option><option value="mora">Mora</option><option value="oceano">Océano</option><option value="tinta">Tinta</option></select></label>
        <label>Tamaño de letra <select data-setting="size" aria-label="Tamaño de letra"><option value="compact">Compacto</option><option value="standard">Mediano</option><option value="large">Grande</option></select></label>
        <label><input data-setting="glass" type="checkbox"> Efecto vidrio</label>
        <label><input data-setting="motion" type="checkbox"> Desplazamiento suave</label>
        <label><input data-setting="style" type="checkbox"> Mejorar la vista normal de letras</label>
        <label><input data-setting="native" type="checkbox"> Usar el botón de pantalla completa de Spotify</label>
      </section>`;
    const ui = Object.fromEntries([...dialog.querySelectorAll("[data-ui]")].map((node) => [node.dataset.ui, node]));
    const state = { dialog, ui, entered, openedAt: performance.now(), controller: new AbortController(),
      rows: [], active: -1, frame: 0, deadline: 0, dirty: false, track: null, previous: null,
      ...nativeView, clock: "", seeking: false, metadataFrame: 0, artworkAnimation: null };
    stage = state;
    const on = (target, type, callback) => target.addEventListener(type, callback, { signal: state.controller.signal });

    ui.follow.checked = settings.follow;
    on(ui.follow, "change", () => {
      settings.follow = ui.follow.checked;
      saveSettings();
    });
    on(ui.exit, "click", () => dialog.close());
    on(ui.back, "click", () => player.back());
    on(ui.play, "click", () => player.togglePlay());
    on(ui.next, "click", () => player.next());
    on(ui.layout, "change", (event) => {
      settings.layout = event.target.value;
      saveSettings();
      if (settings.layout === "cover") {
        stopWatching(state);
        leaveNativeLyrics(state);
        state.source = null;
        state.rows = [];
        state.previous = null;
        state.nativeRows = null;
        state.active = -1;
        ui.lines.replaceChildren();
        ui.credit.hidden = true;
        status(state, state.track?.title ? "Buscando letra…" : "Reproduce una canción para ver su letra.");
      } else {
        openNativeLyrics(state);
        watchLyrics(state);
      }
    });
    on(ui.cover, "load", () => {
      setAmbient(state, ui.cover);
      if (ui.cover.naturalWidth < 512) tryAlbumCover(state);
    });
    on(ui.cover, "error", () => {
      if (state.track?.art && ui.cover.src !== state.track.art) {
        ui.cover.src = state.track.art;
      } else if (ui.cover.hasAttribute("crossorigin") && state.track?.art) {
        ui.cover.removeAttribute("crossorigin");
        ui.cover.src = state.track.art;
      } else ui.cover.hidden = true;
    });
    on(ui.position, "input", () => {
      state.seeking = true;
      ui.elapsed.textContent = time(Number(ui.position.value) * 1000);
    });
    on(ui.position, "change", () => {
      state.seeking = false;
      player.seek(Number(ui.position.value) * 1000);
    });
    on(ui.position, "blur", () => { state.seeking = false; });
    ui.scroll.addEventListener("wheel", () => {
      if (settings.follow && state.rows.length) {
        settings.follow = false;
        saveSettings();
      }
    }, { signal: state.controller.signal, passive: true });
    on(ui.lines, "click", (event) => {
      const row = state.rows[event.target.closest("button[data-line]")?.dataset.line];
      if (row?.target?.isConnected) row.target.click();
    });
    on(ui.tune, "click", () => {
      ui.options.hidden = !ui.options.hidden;
      ui.tune.setAttribute("aria-expanded", String(!ui.options.hidden));
      if (!ui.options.hidden) ui.options.querySelector("select").focus();
    });
    for (const field of ui.options.querySelectorAll("[data-setting]")) {
      const key = field.dataset.setting;
      const checkbox = field.type === "checkbox";
      if (checkbox) field.checked = settings[key];
      else field.value = settings[key];
      on(field, "change", () => {
        settings[key] = checkbox ? field.checked : field.value;
        saveSettings();
      });
    }

    state.onSong = (event) => changeTrack(state, event?.data);
    state.onPlayback = () => updateClock(state);
    player.addEventListener("songchange", state.onSong);
    player.addEventListener("onplaypause", state.onPlayback);
    player.addEventListener("onprogress", state.onPlayback);
    on(dialog, "close", () => dispose(state));
    on(document, "fullscreenchange", () => {
      if (!state.entered || document.fullscreenElement) return;
      if (performance.now() - state.openedAt < 700) state.entered = false;
      else dialog.close();
    });
    on(document, "visibilitychange", () => {
      if (document.hidden) {
        stopWatching(state);
        stopWatchingMetadata(state);
      }
      else {
        changeTrack(state);
        if (stage === state) {
          watchMetadata(state);
          watchLyrics(state);
        }
      }
    });
    document.body.append(dialog);
    applySettings();
    changeTrack(state);
    if (stage === state) {
      dialog.showModal();
      watchMetadata(state);
    }
  }

  function currentPath() {
    return history?.location?.pathname || location.pathname;
  }

  function inLyrics() {
    return /^\/lyrics(?:\/|$)/.test(currentPath()) ||
      document.querySelector(NATIVE_LYRICS)?.getAttribute("aria-pressed") === "true";
  }

  function openNativeLyrics(state) {
    if (settings.layout === "cover" || inLyrics() || document.querySelector(SOURCE)) return;
    const button = document.querySelector(NATIVE_LYRICS);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true" || state.clickedLyrics) return;
    state.clickedLyrics = true;
    button.click();
  }

  function leaveNativeLyrics(state) {
    if (!state.clickedLyrics) return;
    state.clickedLyrics = false;
    const button = document.querySelector(NATIVE_LYRICS);
    if (button?.getAttribute("aria-pressed") === "true") button.click();
    else if (state.routeFrom && !/^\/lyrics(?:\/|$)/.test(state.routeFrom) && inLyrics()) history?.goBack?.();
  }

  function dispose(state) {
    if (stage !== state) return;
    stage = null;
    playbar.active = false;
    state.controller.abort();
    stopWatching(state);
    stopWatchingMetadata(state);
    state.artworkAnimation?.cancel();
    player.removeEventListener("songchange", state.onSong);
    player.removeEventListener("onplaypause", state.onPlayback);
    player.removeEventListener("onprogress", state.onPlayback);
    state.dialog.remove();
    leaveNativeLyrics(state);
    if (state.entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
  }

  function changeTrack(state, eventState) {
    const current = track(eventState);
    if (current.ad) {
      if (state.dialog.open) state.dialog.close();
      else dispose(state);
      return;
    }
    const old = state.track;
    const { ui } = state;
    state.track = current;
    if (!old || old.title !== current.title || old.artists !== current.artists) {
      ui.title.textContent = current.title || (durationMs() > 0 ? "Pista en reproducción" : "Sin reproducción");
      ui.artist.textContent = current.artists;
    }
    if (!old || old.art !== current.art) {
      ui.cover.hidden = true;
      if (current.art) {
        ui.cover.crossOrigin = "anonymous";
        ui.cover.src = fullSizeCover(current.art);
      } else {
        ui.cover.removeAttribute("src");
        state.dialog.style.removeProperty("--lep-art-main");
        state.dialog.style.removeProperty("--lep-art-secondary");
        delete state.dialog.dataset.colors;
        tryAlbumCover(state);
      }
    }
    if (!old || old.uri !== current.uri || (!old.uri && old.title !== current.title) ||
        (!old.title && current.title)) {
      if (state.rows.length) state.previous = state.rows;
      state.rows = [];
      state.active = -1;
      state.clock = "";
      state.seeking = false;
      ui.lines.replaceChildren();
      ui.credit.hidden = true;
      ui.scroll.scrollTop = 0;
      const hasTrack = Boolean(current.title || current.uri || durationMs() > 0);
      status(state, hasTrack ? "Buscando letra…" : "Reproduce una canción para ver su letra.");
      if (hasTrack) openNativeLyrics(state);
      watchLyrics(state);
    }
    updateClock(state);
  }

  function watchMetadata(state) {
    stopWatchingMetadata(state);
    const widget = document.querySelector(WIDGET);
    if (!widget) return;
    state.metadataObserver = new MutationObserver(() => {
      if (state.metadataFrame || document.hidden) return;
      state.metadataFrame = requestAnimationFrame(() => {
        state.metadataFrame = 0;
        if (stage !== state) return;
        if (!widget.isConnected) watchMetadata(state);
        changeTrack(state);
      });
    });
    state.metadataObserver.observe(widget, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["src", "srcset", "href", "title"] });
    if (widget.parentElement) state.metadataObserver.observe(widget.parentElement, { childList: true });
  }

  function stopWatchingMetadata(state) {
    state.metadataObserver?.disconnect();
    cancelAnimationFrame(state.metadataFrame);
    state.metadataFrame = 0;
  }

  function time(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000)) || 0;
    return String(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");
  }

  function durationMs() {
    try { return Math.max(0, Number(player.getDuration()) || 0); }
    catch { return 0; }
  }

  function updateClock(state) {
    if (document.hidden) return;
    const { ui } = state;
    const duration = durationMs();
    const playing = duration > 0 && player.isPlaying();
    if (ui.play.dataset.playing !== String(playing)) {
      ui.play.dataset.playing = String(playing);
      ui.play.innerHTML = icon(playing ? "pause" : "play");
      ui.play.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
    }
    const progress = duration ? Math.max(0, Number(player.getProgress()) || 0) : 0;
    const seconds = Math.min(Math.ceil(duration / 1000), Math.floor(progress / 1000));
    const clock = String(seconds) + "/" + duration;
    if (clock === state.clock || state.seeking) return;
    state.clock = clock;
    ui.position.max = String(Math.ceil(duration / 1000));
    ui.position.disabled = !duration;
    ui.position.value = String(seconds);
    ui.position.setAttribute("aria-valuetext", time(seconds * 1000));
    ui.elapsed.textContent = time(seconds * 1000);
    ui.duration.textContent = time(duration);
    if (duration && !state.track?.title && !state.metadataFrame) {
      state.metadataFrame = requestAnimationFrame(() => {
        state.metadataFrame = 0;
        if (stage === state && !document.hidden) changeTrack(state);
      });
    }
  }

  function stopWatching(state) {
    state.observer?.disconnect();
    state.observer = null;
    clearTimeout(state.deadline);
    cancelAnimationFrame(state.frame);
    state.deadline = 0;
    state.frame = 0;
  }

  function watchLyrics(state) {
    stopWatching(state);
    if (document.hidden || stage !== state || settings.layout === "cover" ||
        !(state.track?.title || state.track?.uri || durationMs() > 0)) return;
    const findSource = () => {
      const mapped = document.querySelector(SOURCE);
      if (mapped && !mapped.closest(PREVIEW)) return mapped;
      if (!inLyrics()) return null;
      const words = [...document.querySelectorAll(TEXT)].filter((node) => !node.closest(PREVIEW));
      if (!words.length) return null;
      let source = words[0].parentElement.parentElement;
      const last = words[words.length - 1];
      while (source && !source.contains(last)) source = source.parentElement;
      return source;
    };
    const source = findSource();
    state.source = source;
    if (source) {
      const host = source.parentElement;
      state.observer = new MutationObserver((changes) => {
        if (!source.isConnected) {
          watchLyrics(state);
          return;
        }
        const rebuild = changes.some((change) => change.type !== "attributes");
        const timing = changes.some(({ target, attributeName, oldValue }) =>
          attributeName !== "class" || target.matches(ACTIVE) ||
          oldValue?.split(/\s+/).includes("lyrics-lyricsContent-active") ||
          (state.usesRenderedLyrics && state.nativeRows?.has(target)));
        if (rebuild || timing || !state.rows.length) queueRead(state, rebuild || !state.rows.length);
      });
      state.observer.observe(source, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeOldValue: true, attributeFilter: ["class", "aria-current", "data-active", "data-current"] });
      if (host) state.observer.observe(host, { childList: true });
      queueRead(state, true);
    } else {
      state.observer = new MutationObserver(() => {
        if (findSource()) watchLyrics(state);
      });
      state.observer.observe(document.querySelector("#main") || document.body, { childList: true, subtree: true });
    }
    if (!state.rows.length) {
      state.deadline = setTimeout(() => {
        state.deadline = 0;
        if (!state.source) stopWatching(state);
        if (!state.rows.length) status(state, "Spotify no muestra una letra para esta pista.");
      }, 5500);
    }
  }

  function queueRead(state, rebuild) {
    state.dirty ||= rebuild;
    if (state.frame || document.hidden) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = 0;
      if (stage !== state || !state.source?.isConnected) return;
      if (state.dirty) readLyrics(state);
      state.dirty = false;
      highlight(state);
    });
  }

  function status(state, message) {
    state.ui.lines.hidden = true;
    state.ui.status.hidden = false;
    if (state.ui.status.textContent !== message) state.ui.status.textContent = message;
  }

  function readLyrics(state) {
    const { ui, source } = state;
    const candidates = [...source.querySelectorAll(LINE)].filter((node) => !node.parentElement?.closest(LINE));
    const nodes = candidates.length ? candidates : [...new Set([...source.querySelectorAll(TEXT)]
      .filter((text) => !text.closest(PREVIEW))
      .map((text) => text.closest(SEEKABLE) || text.parentElement))];
    state.usesRenderedLyrics = !candidates.length;
    state.nativeRows = new Set(nodes);
    const rows = nodes
      .map((node) => ({
        node,
        target: node.matches(SEEKABLE) || (state.usesRenderedLyrics && getComputedStyle(node).cursor === "pointer")
          ? node : node.querySelector(SEEKABLE),
        label: node.querySelector(TEXT),
        text: (node.querySelector(TEXT)?.textContent || node.textContent || "").trim(),
      })).filter(({ text }) => text);
    const equal = (old) => old && rows.length === old.length && rows.every((row, i) =>
      row.node === old[i].node && row.text === old[i].text && row.target === old[i].target);
    if (!rows.length) {
      state.previous = null;
      state.rows = [];
      state.active = -1;
      ui.lines.replaceChildren();
      ui.credit.hidden = true;
      if (!state.deadline) status(state, "Spotify no muestra una letra para esta pista.");
      else status(state, "Buscando letra…");
      return;
    }
    if (equal(state.previous)) return;
    state.previous = null;
    clearTimeout(state.deadline);
    state.deadline = 0;
    if (!equal(state.rows)) {
      const fragment = document.createDocumentFragment();
      state.rows = rows.map((row, index) => {
        const display = document.createElement(row.target ? "button" : "p");
        if (row.target) {
          display.type = "button";
          display.dataset.line = String(index);
        }
        display.className = "lep-line";
        display.dir = "auto";
        display.textContent = row.text;
        fragment.append(display);
        return { ...row, display };
      });
      ui.lines.replaceChildren(fragment);
      state.active = -1;
    }
    ui.lines.dataset.timed = String(rows.some(({ node, target }) => target || node.matches(ACTIVE) || node.querySelector(ACTIVE)));
    ui.status.hidden = true;
    ui.lines.hidden = false;
    const credit = source.querySelector(PROVIDER)?.textContent?.trim() || "";
    ui.credit.textContent = credit;
    ui.credit.hidden = !credit;
  }

  function highlight(state, force = false) {
    if (!state.rows.length || document.hidden || settings.layout === "cover") return;
    let index = state.rows.findIndex(({ node }) => node.matches(ACTIVE) || node.querySelector(ACTIVE));
    if (index < 0 && state.usesRenderedLyrics) index = renderedActiveLine(state);
    if (index === state.active && !force) return;
    state.rows[state.active]?.display.removeAttribute("aria-current");
    state.active = index;
    if (index < 0) return;
    state.ui.lines.dataset.timed = "true";
    const line = state.rows[index].display;
    line.setAttribute("aria-current", "true");
    if (!settings.follow) return;
    const panel = state.ui.scroll;
    const bounds = line.getBoundingClientRect();
    const top = panel.scrollTop + bounds.top - panel.getBoundingClientRect().top - Math.max(0, (panel.clientHeight - bounds.height) * 0.38);
    const smooth = settings.motion && motionPreference.matches && !force;
    panel.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  }

  function renderedActiveLine(state) {
    // The native expanded view paints the current line white even in builds
    // that do not expose its active class through Spicetify's class mapping.
    let active = -1;
    for (let i = 0; i < state.rows.length; i++) {
      const { node, label } = state.rows[i];
      const color = getComputedStyle(label || node).color.match(/[\d.]+/g)?.map(Number);
      if (!color || Math.min(...color.slice(0, 3)) < 246 || (color[3] ?? 1) < 0.9 ||
          Number(getComputedStyle(node).opacity) < 0.9) continue;
      if (active >= 0) return -1;
      active = i;
    }
    return active;
  }

  function open() {
    const current = track();
    if (stage || opening || current.ad || (document.fullscreenElement && document.fullscreenElement !== root)) return false;
    opening = true;
    const nativeView = { routeFrom: currentPath(), clickedLyrics: false };
    // Expand Spotify's own lyrics before entering fullscreen. Mounting the
    // native lyrics panel can itself change the desktop client's view state.
    if (current.title || current.uri || durationMs() > 0) openNativeLyrics(nativeView);
    const full = new Promise((resolve) => requestAnimationFrame(() => {
      if (document.fullscreenElement || !root.requestFullscreen) resolve(false);
      else root.requestFullscreen().then(() => resolve(true), () => resolve(false));
    }));
    full.then((entered) => {
      opening = false;
      if (track().ad) {
        leaveNativeLyrics(nativeView);
        if (entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
        return;
      }
      playbar.active = true;
      try { render(entered, nativeView); } catch (error) {
        if (stage) dispose(stage);
        else {
          leaveNativeLyrics(nativeView);
          if (entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
        }
        playbar.active = false;
        console.warn(TITLE, error);
      }
    });
    return true;
  }

  function initialize(attempts = 0) {
    const api = globalThis.Spicetify;
    if (!api?.Playbar?.Button || typeof api.Player?.addEventListener !== "function" || !document.body) {
      if (attempts < 100) setTimeout(() => initialize(attempts + 1), 200);
      return;
    }
    player = api.Player;
    history = api.Platform?.History;
    const style = document.createElement("style");
    style.id = "lep-style";
    style.textContent = CSS;
    document.head.append(style);
    applySettings();
    playbar = new api.Playbar.Button(TITLE, icon("stage", 16), open);
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element && event.target.closest(NATIVE_FULL);
      if (!settings.native || !button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
      if (document.fullscreenElement || !open()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  const CSS = `
    #lep-dialog {
      --lep-bg: #12131f;
      --lep-ink: #faf7fc;
      --lep-muted: #ded7e6;
      --lep-quiet: #b7aec4;
      --lep-accent: #efd9fb;
      --lep-wash: var(--lep-art-main, #493968);
      --lep-shade: var(--lep-art-secondary, #29233f);
      --lep-size: clamp(1.85rem, 3.6vw, 4.65rem);
      color-scheme: dark;
      color: var(--lep-ink);
      background: var(--lep-bg);
      isolation: isolate;
      box-sizing: border-box;
      position: fixed;
      inset: 0;
      margin: 0;
      border: 0;
      padding: clamp(12px, 2.5vw, 38px) clamp(16px, 5vw, 96px);
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      overflow: hidden;
      font: 500 16px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    }
    #lep-dialog[open] {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: clamp(10px, 2vh, 30px);
    }
    #lep-dialog:modal, #lep-dialog::backdrop { overscroll-behavior: contain; }
    #lep-dialog::backdrop { background: #0e0e17; overflow: hidden; }
    #lep-dialog[data-palette="mora"] { --lep-wash: #603a63; --lep-shade: #3f2448; --lep-accent: #ffc4b7; }
    #lep-dialog[data-palette="oceano"] { --lep-wash: #225a6a; --lep-shade: #18344b; --lep-accent: #b9f4e7; }
    #lep-dialog[data-palette="tinta"] { --lep-wash: #39364a; --lep-shade: #24232e; --lep-accent: #e4ddfc; }
    html[data-lep-size="compact"] #lep-dialog { --lep-size: clamp(1.5rem, 2.7vw, 3.4rem); }
    html[data-lep-size="large"] #lep-dialog { --lep-size: clamp(2.1rem, 4.3vw, 5.4rem); }
    #lep-dialog *, #lep-dialog *::before { box-sizing: border-box; }
    #lep-dialog [hidden] { display: none !important; }
    #lep-dialog :is(h1, h2, p) { margin: 0; }
    #lep-dialog button { margin: 0; color: inherit; font: inherit; border: 0; cursor: pointer; }
    #lep-dialog input { accent-color: var(--lep-accent); }
    #lep-dialog :is(button, input, select, [tabindex]):focus-visible { outline: 2px solid var(--lep-accent); outline-offset: 3px; }
    #lep-dialog .lep-sr, #lep-dialog .lep-layout input {
      position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
    }
    #lep-dialog .lep-ambient {
      position: absolute; inset: 0; pointer-events: none; z-index: -1;
      background:
        radial-gradient(ellipse at 12% 63%, var(--lep-wash), transparent 67%),
        radial-gradient(ellipse at 79% 10%, var(--lep-shade), transparent 66%),
        var(--lep-bg);
    }
    #lep-dialog .lep-glass {
      background: linear-gradient(164deg, #ffffff22, #ffffff06), #11111c82;
      border: 1px solid #ffffff40;
      box-shadow: inset 0 1px 0 #ffffff2d, inset 0 -1px 0 #00000026, 0 12px 32px #08080e38;
    }
    #lep-dialog[data-glass="true"] .lep-glass {
      backdrop-filter: blur(14px) saturate(128%);
    }
    #lep-dialog[data-glass="false"] .lep-glass { background: #171721; box-shadow: none; }
    #lep-dialog .lep-header {
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;
    }
    #lep-dialog .lep-actions { grid-column: 3; justify-self: end; display: flex; gap: 8px; }
    #lep-dialog .lep-layout {
      grid-column: 2; display: flex; gap: 2px; min-width: 0; margin: 0; padding: 3px;
      border-radius: 999px; justify-self: center;
    }
    #lep-dialog .lep-layout label {
      position: relative; min-height: 42px; display: grid; place-items: center; border-radius: 999px;
      padding: 0 clamp(11px, 1.6vw, 25px); cursor: pointer; white-space: nowrap;
      color: var(--lep-muted); font-size: 0.9rem; font-weight: 650;
    }
    #lep-dialog .lep-layout label:hover { background: #ffffff14; }
    #lep-dialog .lep-layout label:has(input:checked) { color: #181423; background: #f3eaf7; box-shadow: 0 1px 5px #08081030; }
    #lep-dialog .lep-layout label:has(input:focus-visible) { outline: 2px solid var(--lep-accent); outline-offset: -1px; }
    #lep-dialog .lep-icon, #lep-dialog .lep-play {
      display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; border-radius: 50%;
    }
    #lep-dialog .lep-transport .lep-icon { background: transparent; }
    #lep-dialog .lep-icon:hover { background: #ffffff24; }
    #lep-dialog .lep-play { background: #f8f0fb; color: #181423; width: 48px; height: 48px; }
    #lep-dialog .lep-play:hover { background: var(--lep-accent); }
    #lep-dialog .lep-body {
      min-height: 0; width: min(100%, 1680px); margin-inline: auto; display: grid;
      grid-template-columns: minmax(180px, 0.92fr) minmax(0, 1.08fr); gap: clamp(28px, 6vw, 120px);
    }
    #lep-dialog .lep-track { min-width: 0; min-height: 0; display: grid; place-items: center; }
    #lep-dialog .lep-cover {
      width: min(100%, 56vh, 650px); aspect-ratio: 1; overflow: hidden;
      border-radius: clamp(12px, 1.6vw, 26px);
      background: linear-gradient(142deg, #ffffff18, #0b0d1424), var(--lep-shade);
      box-shadow: 0 24px 72px #07071166; outline: 1px solid #ffffff35; outline-offset: -1px;
    }
    #lep-dialog .lep-cover img { width: 100%; height: 100%; object-fit: contain; display: block; }
    #lep-dialog[data-layout="cover"] .lep-body, #lep-dialog[data-layout="lyrics"] .lep-body { grid-template-columns: minmax(0, 1fr); }
    #lep-dialog[data-layout="cover"] .lep-cover { width: min(100%, 63vh, 760px); }
    #lep-dialog[data-layout="lyrics"] .lep-lyrics { width: min(100%, 960px); margin: 0 auto; }
    #lep-dialog .lep-lyrics {
      min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto;
    }
    #lep-dialog .lep-scroll {
      overflow: auto; overscroll-behavior: contain; scrollbar-color: #ffffff80 transparent;
      padding: 6px clamp(4px, 1.5vw, 24px);
    }
    #lep-dialog .lep-lines { padding-block: min(23vh, 190px) min(46vh, 440px); display: grid; gap: clamp(13px, 2.3vh, 30px); }
    #lep-dialog .lep-lines[data-timed="false"] { padding-block: clamp(14px, 5vh, 74px); }
    #lep-dialog :is(button, p).lep-line {
      position: relative; text-align: start; background: transparent; border-radius: 6px;
      color: var(--lep-quiet); font: 720 var(--lep-size)/1.13 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
      letter-spacing: -0.048em; overflow-wrap: anywhere; padding: 4px 0 4px clamp(9px, 1.2vw, 20px); text-wrap: pretty;
    }
    #lep-dialog button.lep-line:hover { color: var(--lep-muted); }
    #lep-dialog :is(button, p).lep-line[aria-current="true"], #lep-dialog [data-timed="false"] :is(button, p).lep-line { color: var(--lep-ink); }
    #lep-dialog .lep-line[aria-current="true"]::before {
      content: ""; position: absolute; inset-block: 16%; inset-inline-start: 0;
      width: 3px; border-radius: 4px; background: var(--lep-accent);
    }
    #lep-dialog .lep-status { padding-block: min(18vh, 145px); color: var(--lep-muted); max-width: 33ch; font-size: clamp(1rem, 1.8vw, 1.45rem); }
    #lep-dialog .lep-credit { color: var(--lep-muted); font-size: 0.75rem; padding: 8px clamp(4px, 1.5vw, 24px) 0; }
    #lep-dialog .lep-dock {
      justify-self: center; width: min(100%, 1120px); border-radius: 26px; padding: 8px clamp(12px, 2vw, 28px);
      display: grid; align-items: center;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 1.65fr) minmax(0, 1fr); gap: clamp(10px, 2vw, 28px);
    }
    #lep-dialog .lep-identity { min-width: 0; }
    #lep-dialog .lep-identity h2 { font-size: clamp(1rem, 1.35vw, 1.22rem); font-weight: 730; }
    #lep-dialog .lep-identity p { color: var(--lep-muted); font-size: 0.85rem; }
    #lep-dialog .lep-identity :is(h2,p) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    #lep-dialog .lep-playback { min-width: 0; display: grid; gap: 4px; }
    #lep-dialog .lep-transport { display: flex; align-items: center; justify-content: center; gap: 10px; }
    #lep-dialog .lep-position {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
      color: var(--lep-muted); font: 600 0.76rem/1 "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums;
    }
    #lep-dialog .lep-position input { margin: 0; min-width: 0; width: 100%; cursor: pointer; }
    #lep-dialog .lep-follow {
      justify-self: end; display: flex; align-items: center; gap: 6px; min-height: 44px;
      font-size: 0.82rem; color: var(--lep-muted); cursor: pointer;
    }
    #lep-dialog .lep-options {
      position: absolute; z-index: 1; inset-block-start: clamp(64px, 9vh, 110px);
      inset-inline-end: clamp(16px, 5vw, 96px); width: min(calc(100% - 32px), 350px);
      padding: 18px; background-color: #171622e8; border-radius: 20px; display: grid; gap: 12px;
    }
    #lep-dialog .lep-options label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.9rem; }
    #lep-dialog .lep-options label:has(input) { justify-content: start; }
    #lep-dialog .lep-options select { color: var(--lep-ink); font: inherit; background: #262438; border: 1px solid #ffffff50; padding: 6px 8px; border-radius: 8px; }
    html[data-lep-style="true"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.35rem, 2.9vw, 3.3rem) !important; line-height: 1.18 !important; letter-spacing: -0.027em; }
    html[data-lep-style="true"][data-lep-size="compact"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.2rem, 2.4vw, 2.7rem) !important; }
    html[data-lep-style="true"][data-lep-size="large"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.65rem, 3.5vw, 4rem) !important; }
    html[data-lep-style="true"] :is(.lyrics-lyricsContent-lyric.lyrics-lyricsContent-active, [aria-current="true"] > .lyrics-lyricsContent-text) { text-decoration: underline 0.04em currentColor; text-underline-offset: 0.16em; }
    @media (prefers-reduced-motion: no-preference) {
      html[data-lep-motion="true"] #lep-dialog :is(button, p).lep-line { transition: color 150ms ease; }
    }
    @media (max-width: 720px) {
      #lep-dialog .lep-header { grid-template-columns: auto 1fr; }
      #lep-dialog .lep-layout { grid-column: 1; justify-self: start; }
      #lep-dialog .lep-actions { grid-column: 2; }
      #lep-dialog .lep-body { gap: 8px; }
      #lep-dialog[data-layout="both"] .lep-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
      #lep-dialog[data-layout="both"] .lep-cover { width: min(45vw, 27vh); border-radius: 12px; }
      #lep-dialog .lep-lines { padding-block: 6vh 40vh; }
      #lep-dialog .lep-dock { grid-template-columns: minmax(0, 1fr) minmax(0, auto); padding: 8px 14px; gap: 4px; }
      #lep-dialog .lep-identity { grid-column: 1; }
      #lep-dialog .lep-follow { grid-column: 2; grid-row: 1; font-size: 0.75rem; min-height: 30px; }
      #lep-dialog .lep-playback { grid-column: 1 / -1; }
      #lep-dialog .lep-transport { gap: 4px; }
      #lep-dialog .lep-transport .lep-icon, #lep-dialog .lep-play { width: 44px; height: 44px; }
    }
    @media (max-height: 540px) and (min-width: 721px) {
      #lep-dialog .lep-cover { width: min(100%, 49vh); }
    }
  `;

  initialize();
})();
