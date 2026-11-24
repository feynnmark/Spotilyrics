// NAME: Letras en pantalla
// VERSION: 1.4.0
// DESCRIPTION: Letras nativas, portadas y controles en pantalla completa.

(() => {
  "use strict";

  const root = document.documentElement;
  if (root.dataset.lepLoaded) return;
  root.dataset.lepLoaded = "true";

  const TITLE = "Letras en pantalla";
  const KEY = "letras-en-pantalla:config";
  const WELCOME_KEY = "letras-en-pantalla:welcome";
  const IDLE_MS = 3000;
  const NATIVE_FULL = 'button[data-testid="fullscreen-mode-button"]';
  const MARKETPLACE_LINK = ':is(.custom-navlink, .main-yourLibraryX-navLink):is([aria-label="Marketplace"], [aria-label="Маркетплейс"], [href="/marketplace"])';
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
    full: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M5 6v12m14-12-9 6 9 6Z" fill="currentColor"/>',
    next: '<path d="M19 6v12M5 6l9 6-9 6Z" fill="currentColor"/>',
    play: '<path d="m9 5 11 7-11 7Z" fill="currentColor"/>',
    pause: '<path d="M9 5v14m6-14v14" stroke-width="3"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4zm12-.5a5 5 0 0 1 0 7m2.5-10a9 9 0 0 1 0 13"/>',
    tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--lep-bg)"/><circle cx="15" cy="17" r="2" fill="var(--lep-bg)"/>',
  };
  const icon = (name, size = 22) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DRAWINGS[name] + '</svg>';
  const motionPreference = matchMedia("(prefers-reduced-motion: no-preference)");
  const settings = { layout: "both", palette: "album", size: "standard", motion: true, follow: true,
    native: true, style: true, glass: true, drift: true, marketplace: false };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const key of ["motion", "follow", "native", "style", "glass", "drift", "marketplace"]) {
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
    root.dataset.lepMarketplace = String(settings.marketplace);
    if (!stage) return;
    stage.dialog.dataset.palette = settings.palette;
    stage.dialog.dataset.glass = String(settings.glass);
    stage.dialog.dataset.drift = String(settings.drift);
    stage.dialog.dataset.layout = settings.layout;
    stage.ui.track.hidden = settings.layout === "lyrics";
    stage.ui.lyrics.hidden = settings.layout === "cover";
    stage.ui.followControl.hidden = settings.layout === "cover";
    stage.ui.follow.checked = settings.follow;
    for (const field of stage.ui.layout.elements) field.checked = field.value === settings.layout;
  }

  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Keep session preferences. */ }
    applySettings();
  }

  function switchLayout(state, layout) {
    const before = settings.layout;
    if (layout === before) return;
    const elements = [state.ui.card, state.ui.lyrics];
    const animate = canAnimate(elements[0]);
    const oldBounds = animate ? elements.map((element) => element.getBoundingClientRect()) : [];
    const exitBounds = animate && state.coverExit?.node.getBoundingClientRect();
    state.layoutAnimations.forEach((animation) => animation.cancel());
    state.layoutAnimations = [];
    clearCoverExit(state);
    clearCoverSlide(state);
    if (animate && layout === "lyrics") {
      const [bounds] = oldBounds;
      const copy = copyCard(state, bounds, "lep-cover-ghost");
      const animation = copy.animate([
        { transform: "none", opacity: 1 },
        { transform: "translateX(" + (-bounds.right - 32) + "px)", opacity: 0.24 },
      ], { duration: 450, easing: "cubic-bezier(.42,0,.65,1)" });
      state.coverExit = { node: copy, animation };
      animation.onfinish = () => clearCoverExit(state);
    }
    settings.layout = layout;
    saveSettings();
    if (layout === "cover") stopWatching(state);
    else if (before === "cover") watchLyrics(state);
    highlight(state, true);
    if (!animate) return;

    for (const [i, element] of elements.entries()) {
      const next = element.getBoundingClientRect();
      const old = i === 0 && exitBounds ? exitBounds : oldBounds[i];
      if (!next.width || !next.height) continue;
      const entering = !old.width || !old.height;
      const horizontal = entering ? (i === 0 ? -next.right - 32 : 30) : old.left - next.left;
      const vertical = entering ? 0 : old.top - next.top;
      const scale = i === 0 && !entering ? old.width / next.width : 1;
      state.layoutAnimations.push(element.animate([
        { transformOrigin: "top left", transform: "translate(" + horizontal + "px," + vertical + "px) scale(" + scale + ")", opacity: entering ? 0 : 0.82 },
        { transformOrigin: "top left", transform: "none", opacity: 1 },
      ], { duration: i === 0 ? 450 : 340, easing: "cubic-bezier(.22,.61,.36,1)" }));
    }
  }

  function canAnimate(element) {
    return !document.hidden && settings.motion && motionPreference.matches && typeof element.animate === "function";
  }

  function clearCoverExit(state) {
    state.coverExit?.animation.cancel();
    state.coverExit?.node.remove();
    state.coverExit = null;
  }

  function copyCard(state, bounds, className) {
    const copy = state.ui.card.cloneNode(true);
    copy.removeAttribute("data-ui");
    copy.setAttribute("aria-hidden", "true");
    for (const child of copy.querySelectorAll("[data-ui]")) child.removeAttribute("data-ui");
    copy.classList.add("lep-card-copy", className);
    Object.assign(copy.style, { left: bounds.left + "px", top: bounds.top + "px", width: bounds.width + "px" });
    state.dialog.append(copy);
    return copy;
  }

  function revealControls(state, event) {
    if (event?.type === "keydown") state.keyboard = true;
    if (event?.type === "pointermove" || event?.type === "pointerdown") state.keyboard = false;
    state.lastInput = performance.now();
    if (state.dialog.dataset.idle) delete state.dialog.dataset.idle;
    if (state.idleTimer || document.hidden) return;
    state.idleTimer = setTimeout(hideWhenIdle, IDLE_MS);

    function hideWhenIdle() {
      state.idleTimer = 0;
      if (stage !== state || !state.dialog.open || document.hidden ||
          state.keyboard || !state.ui.options.hidden || state.seeking || state.adjustingVolume) return;
      const remaining = IDLE_MS - (performance.now() - state.lastInput);
      if (remaining > 0) state.idleTimer = setTimeout(hideWhenIdle, remaining);
      else state.dialog.dataset.idle = "true";
    }
  }

  function track(eventState) {
    const states = [eventState, player.data, player.origin?._state].filter(Boolean);
    const item = states.map((state) => state.item || state.track || state.currentTrack).find(Boolean);
    const meta = item?.metadata ?? {};
    const widget = document.querySelector(WIDGET);
    const link = widget?.querySelector(TRACK_LINK) || widget?.querySelector('a[href^="/album/"]');
    const media = navigator.mediaSession?.metadata;
    const widgetTitle = link?.textContent?.trim() || link?.getAttribute("title") || "";
    const visibleUri = /\/(track|episode)\/([a-z0-9]+)/i.exec(link?.getAttribute("href") || "");
    const uri = item?.uri || (visibleUri ? ["spotify", ...visibleUri.slice(1)].join(":") : "");
    const album = /^spotify:album:([a-z0-9]{22})$/i.exec(meta.album_uri || item?.album?.uri || "") ||
      /\/album\/([a-z0-9]{22})(?:[/?#]|$)/i.exec(link?.getAttribute("href") || "");
    const title = meta.title || item?.name || item?.title || widgetTitle || media?.title || "";
    const mediaMatches = !title || !media?.title || title === media.title;
    const artistLinks = !widgetTitle || widgetTitle === title ? [...(widget?.querySelectorAll(ARTIST_LINK) ?? [])] : [];
    const artists = item?.artists?.map?.((artist) => artist?.name).filter(Boolean).join(", ") ||
      Object.keys(meta).filter((key) => /^artist_name(?::\d+)?$/.test(key)).map((key) => meta[key]).filter(Boolean).join(", ") ||
      [...new Set(artistLinks.map((node) => node.textContent.trim()).filter(Boolean))].join(", ") ||
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

  async function albumArtwork(albumId, signal) {
    if (!albumId) return "";
    const request = new URL("https://open.spotify.com/oembed");
    request.searchParams.set("url", "https://open.spotify.com/album/" + albumId);
    try {
      const response = await fetch(request, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(2200)]) : signal,
      });
      if (response.ok) {
        const thumbnail = artwork((await response.json()).thumbnail_url);
        if (thumbnail) return fullSizeCover(thumbnail);
      }
    } catch { /* The native artwork remains available. */ }
    return "";
  }

  async function decodeArtwork(source, signal, cors = true) {
    if (!source || signal.aborted) return null;
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.src = source;
    try { await image.decode(); } catch { return null; }
    return signal.aborted ? null : image;
  }

  async function updateCover(state, current) {
    state.coverRequest?.abort();
    const { signal } = (state.coverRequest = new AbortController());
    const source = current.art && fullSizeCover(current.art);
    const key = source + "|" + current.albumId;
    const existing = state.ui.cover;
    if (key === state.coverKey && !existing.hidden) {
      paintTrackCard(state);
      return;
    }

    let image = await decodeArtwork(source, signal);
    if (!image && current.art !== source) image = await decodeArtwork(current.art, signal);
    if (signal.aborted) return;
    if (!image || image.naturalWidth < 512) {
      const alternate = await albumArtwork(current.albumId, signal);
      if (alternate && alternate !== source) {
        const larger = await decodeArtwork(alternate, signal);
        if (larger && (!image || larger.naturalWidth > image.naturalWidth)) image = larger;
      }
    }
    if (!image) image = await decodeArtwork(current.art, signal, false);
    if (stage !== state || signal.aborted) return;

    if (!image) {
      paintTrackCard(state, null);
      state.coverKey = "";
      state.ui.ambient.removeAttribute("data-texture");
      state.dialog.style.removeProperty("--lep-art-main");
      state.dialog.style.removeProperty("--lep-art-secondary");
      delete state.dialog.dataset.colors;
      return;
    }
    state.coverKey = key;
    image.dataset.ui = "cover";
    image.alt = "Carátula del álbum";
    image.setAttribute("aria-description", image.naturalWidth + " × " + image.naturalHeight + " píxeles");
    paintTrackCard(state, image);
    setAmbient(state, image);
  }

  function updateCaption(state) {
    const { title, artists } = state.track;
    for (const [node, value] of [[state.ui.title, title], [state.ui.artist, artists]]) {
      if (node.textContent !== value) node.textContent = value;
      node.hidden = !value;
    }
    state.ui.caption.hidden = !title && !artists;
  }

  function paintTrackCard(state, image) {
    const { card, cover, track, caption } = state.ui;
    const direction = state.slideDirection;
    clearTimeout(state.slideTimer);
    state.slideDirection = 0;
    const animate = direction && !track.hidden && (!cover.hidden || !caption.hidden) && canAnimate(card);
    const outgoing = animate && copyCard(state, card.getBoundingClientRect(), "lep-cover-outgoing");
    if (image) {
      cover.replaceWith(image);
      state.ui.cover = image;
    } else if (image === null) {
      cover.hidden = true;
      cover.removeAttribute("src");
    }
    updateCaption(state);
    if (!outgoing) return;
    const shift = (value) => "translateX(" + value * 100 + "%)";
    const timing = { duration: 640, easing: "cubic-bezier(.37,.03,.18,1)", fill: "both" };
    const exit = outgoing.animate([{ transform: "none", opacity: 1 }, { transform: shift(-direction), opacity: 0 }], timing);
    const enter = card.animate([{ transform: shift(direction), opacity: 0 }, { transform: "none", opacity: 1 }], timing);
    state.coverSlide = { node: outgoing, exit, enter };
    exit.onfinish = () => clearCoverSlide(state);
  }

  function clearCoverSlide(state) {
    state.coverSlide?.exit.cancel();
    state.coverSlide?.enter.cancel();
    state.coverSlide?.node.remove();
    state.coverSlide = null;
  }

  function setAmbient(state, cover) {
    const { ambient, texture } = state.ui;
    ambient.removeAttribute("data-texture");
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
    const blurred = texture.getContext("2d");
    if (blurred) {
      const size = texture.width;
      blurred.clearRect(0, 0, size, size);
      blurred.filter = "blur(3px) saturate(1.35)";
      blurred.drawImage(cover, -9, -9, size + 18, size + 18);
      ambient.dataset.texture = "true";
    }
    const swatches = [
      averageColor(pixels, 0, size / 2),
      averageColor(pixels, size / 2, size),
    ];
    const colors = swatches.map(([hue, saturation], index) =>
      "hsl(" + hue + " " + Math.max(12, saturation) + "% " + (index ? 24 : 33) + "%)");
    const dialog = state.dialog;
    const signature = colors.join("/");
    dialog.dataset.colors = signature;
    dialog.style.setProperty("--lep-art-main", colors[0]);
    dialog.style.setProperty("--lep-art-secondary", colors[1]);
    state.artworkAnimation?.cancel();
    if (settings.palette === "album" && blurred && canAnimate(texture)) {
      state.artworkAnimation = texture.animate([{ opacity: 0.15 }, { opacity: 1 }], {
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
      <div class="lep-ambient" data-ui="ambient" aria-hidden="true">
        <canvas class="lep-texture" data-ui="texture" width="48" height="48"></canvas>
      </div>
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
          <figure class="lep-card" data-ui="card">
            <div class="lep-cover"><img data-ui="cover" alt="Carátula del álbum" decoding="async" referrerpolicy="no-referrer" hidden></div>
            <figcaption class="lep-caption" data-ui="caption" hidden>
              <h2 data-ui="title" dir="auto" hidden></h2>
              <p data-ui="artist" dir="auto" hidden></p>
            </figcaption>
          </figure>
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
        <div class="lep-volume">
          ${icon("volume", 20)}
          <input type="range" min="0" max="100" value="0" step="1" data-ui="volume" aria-label="Volumen" disabled>
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
        <label><input data-setting="drift" type="checkbox"> Fondo en movimiento</label>
        <label><input data-setting="motion" type="checkbox"> Desplazamiento suave</label>
        <label><input data-setting="style" type="checkbox"> Mejorar la vista normal de letras</label>
        <label><input data-setting="native" type="checkbox"> Usar el botón de pantalla completa de Spotify</label>
        <label id="lep-marketplace-setting"><input data-setting="marketplace" type="checkbox"> Mostrar acceso a Marketplace</label>
      </section>`;
    const ui = Object.fromEntries([...dialog.querySelectorAll("[data-ui]")].map((node) => [node.dataset.ui, node]));
    const state = { dialog, ui, entered, openedAt: performance.now(), controller: new AbortController(),
      rows: [], active: -1, frame: 0, deadline: 0, dirty: false, track: null, previous: null,
      ...nativeView, clock: "", seeking: false, metadataFrame: 0, artworkAnimation: null,
      layoutAnimations: [], idleTimer: 0, keyboard: false };
    stage = state;
    const on = (target, type, callback) => target.addEventListener(type, callback, { signal: state.controller.signal });

    ui.follow.checked = settings.follow;
    for (const type of ["pointermove", "pointerdown"]) on(dialog, type, (event) => revealControls(state, event));
    on(document, "keydown", (event) => { if (state.dialog.open) revealControls(state, event); });
    on(dialog, "focusin", () => { if (state.keyboard) revealControls(state); });
    on(ui.follow, "change", () => {
      settings.follow = ui.follow.checked;
      saveSettings();
      if (settings.follow) highlight(state, true);
    });
    on(ui.exit, "click", () => dialog.close());
    on(ui.back, "click", () => skip(state, -1));
    on(ui.play, "click", () => player.togglePlay());
    on(ui.next, "click", () => skip(state, 1));
    on(ui.layout, "change", (event) => switchLayout(state, event.target.value));
    on(ui.volume, "pointerenter", () => syncVolume(state));
    on(ui.volume, "pointerdown", () => { state.adjustingVolume = true; });
    for (const type of ["pointerup", "pointercancel"]) on(document, type, () => {
      if (!state.adjustingVolume) return;
      state.adjustingVolume = false;
      revealControls(state);
    });
    on(ui.volume, "focus", () => syncVolume(state));
    on(ui.volume, "input", () => {
      ui.volume.setAttribute("aria-valuetext", ui.volume.value + "%");
      try { player.setVolume(ui.volume.valueAsNumber / 100); } catch { syncVolume(state); }
    });
    on(ui.position, "input", () => {
      state.seeking = true;
      ui.elapsed.textContent = time(Number(ui.position.value) * 1000);
    });
    on(ui.position, "change", () => {
      state.seeking = false;
      revealControls(state);
      player.seek(Number(ui.position.value) * 1000);
    });
    on(ui.position, "blur", () => {
      state.seeking = false;
      revealControls(state);
    });
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
      revealControls(state);
    });
    for (const field of ui.options.querySelectorAll("[data-setting]")) {
      const key = field.dataset.setting;
      const checkbox = field.type === "checkbox";
      if (checkbox) field.checked = settings[key];
      else field.value = settings[key];
      on(field, "change", () => {
        settings[key] = checkbox ? field.checked : field.value;
        saveSettings();
        if (key === "size") highlight(state, true);
      });
    }

    state.onSong = (event) => changeTrack(state, event?.data);
    state.onPlayback = () => {
      const uri = player.data?.item?.uri || player.origin?._state?.item?.uri;
      if (!document.hidden && uri && uri !== state.track?.uri) changeTrack(state);
      else updateClock(state);
    };
    const volumeEvents = globalThis.Spicetify?.Platform?.PlaybackAPI?._events;
    if (typeof volumeEvents?.removeListener === "function") {
      const onVolume = (event) => syncVolume(state, event?.data?.volume);
      volumeEvents.addListener?.("volume", onVolume);
      state.controller.signal.addEventListener("abort", () => volumeEvents.removeListener("volume", onVolume), { once: true });
    }
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
      dialog.dataset.inactive = String(document.hidden);
      if (document.hidden) {
        clearCoverSlide(state);
        clearCoverExit(state);
        state.adjustingVolume = false;
        stopWatching(state);
        stopWatchingMetadata(state);
        clearTimeout(state.idleTimer);
        state.idleTimer = 0;
      }
      else {
        changeTrack(state);
        if (stage === state) {
          watchMetadata(state);
          watchLyrics(state);
          revealControls(state);
        }
      }
    });
    document.body.append(dialog);
    applySettings();
    syncVolume(state);
    changeTrack(state);
    if (stage === state) {
      dialog.showModal();
      watchMetadata(state);
      revealControls(state);
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
    if (inLyrics() || document.querySelector(SOURCE)) return;
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
    clearTimeout(state.idleTimer);
    clearTimeout(state.slideTimer);
    stopWatching(state);
    stopWatchingMetadata(state);
    state.artworkAnimation?.cancel();
    state.coverRequest?.abort();
    state.layoutAnimations.forEach((animation) => animation.cancel());
    clearCoverExit(state);
    clearCoverSlide(state);
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
    const swapped = old && (old.uri && current.uri ? old.uri !== current.uri :
      old.title && current.title && old.title !== current.title);
    state.track = current;
    if (swapped) {
      clearCoverSlide(state);
      clearTimeout(state.slideTimer);
      state.slideDirection = trackDirection(state, current.uri);
      state.lastTrackUri = old.uri;
      state.neighbors = null;
      // Spotify can publish the track before its artwork. Give the image a
      // short head start, but never let a late refresh cancel the transition.
      state.slideTimer = setTimeout(() => paintTrackCard(state), 220);
    }
    if (!state.slideDirection) updateCaption(state);
    if (!old || swapped || old.art !== current.art || old.albumId !== current.albumId) updateCover(state, current);
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

  function skip(state, direction) {
    state.skip = { direction, expires: performance.now() + 1800 };
    if (direction < 0) player.back();
    else player.next();
  }

  function trackDirection(state, uri) {
    const skip = state.skip;
    state.skip = null;
    if (skip && performance.now() <= skip.expires) return skip.direction;
    if (!uri || uri === state.neighbors?.next) return 1;
    return uri === state.neighbors?.previous || uri === state.lastTrackUri ? -1 : 1;
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

  function syncVolume(state, volume) {
    const { volume: slider } = state.ui;
    if (state.adjustingVolume || typeof player.setVolume !== "function") return;
    try { volume ??= player.getVolume?.(); } catch { return; }
    if (!Number.isFinite(volume)) return;
    slider.disabled = false;
    const percent = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    if (slider.valueAsNumber !== percent || !slider.hasAttribute("aria-valuetext")) {
      slider.valueAsNumber = percent;
      slider.setAttribute("aria-valuetext", percent + "%");
    }
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
    syncVolume(state);
    const queue = globalThis.Spicetify?.Queue;
    if (queue?.track?.uri && queue.track.uri === state.track?.uri) {
      const previous = queue.prevTracks;
      state.neighbors = { previous: previous?.[previous.length - 1]?.uri, next: queue.nextTracks?.[0]?.uri };
    }
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
    const firstRender = !state.rows.length;
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
    if (firstRender && !settings.follow && ui.lines.dataset.timed === "true") {
      const leadingSpace = parseFloat(getComputedStyle(ui.lines).paddingBlockStart);
      ui.scroll.scrollTop = Math.max(0, leadingSpace - ui.scroll.clientHeight * 0.14);
    }
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
    const top = panel.scrollTop + bounds.top - panel.getBoundingClientRect().top - Math.max(0, (panel.clientHeight - bounds.height) * 0.43);
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
    document.querySelector("#lep-welcome[open]")?.close();
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

  function showWelcomeWhenReady() {
    try { if (localStorage.getItem(WELCOME_KEY)) return; } catch { /* Show once this session. */ }
    if (showWelcome()) return;
    const observer = new MutationObserver(() => { if (showWelcome()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });

    function showWelcome() {
      if (!document.querySelector(NATIVE_FULL)) return false;
      try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* Keep this session usable. */ }
      if (stage || opening || typeof HTMLDialogElement.prototype.show !== "function") return true;
      const dialog = document.createElement("dialog");
      dialog.id = "lep-welcome";
      dialog.setAttribute("aria-labelledby", "lep-welcome-title");
      dialog.innerHTML = `
        <div class="lep-welcome-icon">${icon("stage", 25)}</div>
        <h2 id="lep-welcome-title">Letras en pantalla está listo</h2>
        <ol>
          <li>Reproduce una canción en Spotify.</li>
          ${settings.native ? `<li>Pulsa <strong>Pantalla completa</strong> ${icon("full", 15)} en la esquina inferior derecha.</li>` : ""}
          <li>${settings.native ? "También puedes usar" : "Pulsa"} el botón <strong>Letras en pantalla</strong> ${icon("stage", 15)} en la barra de reproducción.</li>
        </ol>
        <form method="dialog"><button type="submit">Entendido</button></form>`;
      root.dataset.lepWelcome = String(settings.native);
      dialog.addEventListener("close", () => {
        delete root.dataset.lepWelcome;
        dialog.remove();
      }, { once: true });
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          dialog.close();
        }
      });
      document.body.append(dialog);
      dialog.show();
      return true;
    }
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
    showWelcomeWhenReady();
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element && event.target.closest(NATIVE_FULL);
      if (!settings.native || !button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
      if (document.fullscreenElement || !open()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  const CSS = `
    html[data-lep-marketplace="false"] ${MARKETPLACE_LINK},
    html:not(:has(${MARKETPLACE_LINK})) #lep-marketplace-setting { display: none !important; }
    html[data-lep-welcome="true"] ${NATIVE_FULL} { outline: 2px solid #e9cdfa; outline-offset: 3px; border-radius: 8px; }
    #lep-welcome {
      position: fixed; z-index: 10000; inset: auto clamp(12px, 2vw, 32px) clamp(82px, 11vh, 120px) auto;
      margin: 0; width: min(366px, calc(100% - 24px)); padding: 23px;
      box-sizing: border-box; border: 1px solid #ffffff36; border-radius: 22px;
      color: #faf6ff; background: linear-gradient(145deg, #2f203c, #1b1824 67%);
      box-shadow: 0 22px 56px #08070cbc; font: 500 14px/1.55 "Segoe UI", system-ui, sans-serif;
    }
    #lep-welcome .lep-welcome-icon {
      display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 12px;
      border: 1px solid #f2dcff47; border-radius: 14px; color: #f3dcff; background: #f0c3fa16;
    }
    #lep-welcome h2 { font: 720 21px/1.18 "Segoe UI", system-ui, sans-serif; margin: 0; letter-spacing: -.02em; }
    #lep-welcome ol { color: #e0d7e9; margin: 14px 0 17px; padding-inline-start: 19px; }
    #lep-welcome li + li { margin-top: 5px; }
    #lep-welcome li svg { vertical-align: -.17em; margin-inline-start: 3px; }
    #lep-welcome form { display: flex; justify-content: flex-end; }
    #lep-welcome button {
      min-height: 38px; padding: 6px 17px; border: 0; border-radius: 999px;
      background: #ecd8fc; color: #20172a; font: inherit; font-weight: 700; cursor: pointer;
    }
    #lep-welcome button:focus-visible { outline: 2px solid #f0daff; outline-offset: 3px; }
    #lep-dialog {
      --lep-bg: #12131f;
      --lep-ink: #faf7fc;
      --lep-muted: #ded7e6;
      --lep-quiet: #b7aec4;
      --lep-accent: #efd9fb;
      --lep-wash: var(--lep-art-main, #493968);
      --lep-shade: var(--lep-art-secondary, #29233f);
      --lep-size: clamp(1.85rem, 3.6vw, 4.65rem);
      --lep-inset: clamp(16px, 5vw, 96px);
      --lep-edge: clamp(12px, 2.5vw, 38px);
      color-scheme: dark;
      color: var(--lep-ink);
      background: var(--lep-bg);
      isolation: isolate;
      box-sizing: border-box;
      position: fixed;
      inset: 0;
      margin: 0;
      border: 0;
      padding: 0 var(--lep-inset);
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      overflow: hidden;
      font: 500 16px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
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
      overflow: hidden;
      background: var(--lep-bg);
    }
    #lep-dialog .lep-ambient::before {
      content: "";
      position: absolute; inset: -13%;
      translate: 0 0;
      scale: 1;
      background:
        radial-gradient(ellipse at 23% 65%, var(--lep-wash), transparent 63%),
        radial-gradient(ellipse at 76% 23%, var(--lep-shade), transparent 69%),
        var(--lep-bg);
    }
    #lep-dialog .lep-texture {
      display: none; position: absolute; inset: -17%; width: 134%; height: 134%; object-fit: cover;
      transform: none;
    }
    #lep-dialog[data-palette="album"] .lep-ambient[data-texture] .lep-texture { display: block; }
    #lep-dialog[data-palette="album"] .lep-ambient[data-texture]::after {
      content: ""; position: absolute; inset: 0;
      background: radial-gradient(ellipse at 24% 54%, #100f1d14 5%, #100f1d70 100%),
        linear-gradient(90deg, #0c0b1524, #0d0b18a6);
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
      inset-block-start: var(--lep-edge); inset-inline: var(--lep-inset);
    }
    #lep-dialog :is(.lep-header, .lep-dock) {
      position: absolute; z-index: 2; opacity: 1; translate: 0 0;
    }
    #lep-dialog[data-idle="true"], #lep-dialog[data-idle="true"] * { cursor: none; }
    #lep-dialog[data-idle="true"] :is(.lep-header, .lep-dock) {
      opacity: 0; visibility: hidden; pointer-events: none;
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
      height: 100%; width: min(100%, 1680px); margin-inline: auto; display: grid; grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(180px, 0.92fr) minmax(0, 1.08fr); gap: clamp(28px, 6vw, 120px);
    }
    #lep-dialog .lep-track { min-width: 0; min-height: 0; display: grid; place-items: center; }
    #lep-dialog .lep-card {
      width: min(100%, 53vh, 650px); min-width: 0; margin: 0; display: grid; gap: clamp(8px, 1.6vh, 22px);
    }
    #lep-dialog .lep-cover {
      position: relative; width: 100%; aspect-ratio: 1; overflow: hidden;
      border-radius: clamp(12px, 1.6vw, 26px);
      background: linear-gradient(142deg, #ffffff18, #0b0d1424), var(--lep-shade);
      box-shadow: 0 24px 72px #07071166; outline: 1px solid #ffffff35; outline-offset: -1px;
    }
    #lep-dialog .lep-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
    #lep-dialog .lep-caption { min-width: 0; text-align: center; text-shadow: 0 2px 10px #07071180; }
    #lep-dialog .lep-caption :is(h2, p) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #lep-dialog .lep-caption h2 { font-size: clamp(1.09rem, 1.9vw, 2.1rem); font-weight: 710; letter-spacing: -.022em; }
    #lep-dialog .lep-caption p { color: var(--lep-muted); font-size: clamp(.88rem, 1.18vw, 1.2rem); }
    #lep-dialog .lep-card.lep-card-copy { position: absolute; z-index: 1; pointer-events: none; }
    #lep-dialog[data-layout="cover"] .lep-body, #lep-dialog[data-layout="lyrics"] .lep-body { grid-template-columns: minmax(0, 1fr); }
    #lep-dialog[data-layout="cover"] .lep-card { width: min(100%, 59vh, 760px); }
    #lep-dialog[data-layout="lyrics"] .lep-lyrics { width: min(100%, 960px); margin: 0 auto; }
    #lep-dialog .lep-lyrics {
      position: relative; min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr);
      container-type: size;
    }
    #lep-dialog .lep-scroll {
      --lep-lyric-mask: linear-gradient(to bottom, transparent, black 12%, black 78%, transparent);
      overflow: auto; overscroll-behavior: contain; scrollbar-width: none;
      padding-inline: clamp(6px, 1.5vw, 24px);
      -webkit-mask-image: var(--lep-lyric-mask);
      mask-image: var(--lep-lyric-mask);
    }
    #lep-dialog .lep-lyrics:has(.lep-scroll:focus-visible) { outline: 2px solid var(--lep-accent); outline-offset: -2px; }
    #lep-dialog .lep-scroll::-webkit-scrollbar { display: none; }
    #lep-dialog .lep-lines { padding-block: 43vh 57vh; padding-block: 43cqh 57cqh; display: grid; gap: clamp(13px, 2.3vh, 30px); }
    #lep-dialog .lep-lines[data-timed="false"] { padding-block: max(12vh, 50px) max(15vh, 76px); }
    #lep-dialog :is(button, p).lep-line {
      position: relative; text-align: start; background: transparent; border-radius: 6px;
      color: var(--lep-quiet); font: 720 var(--lep-size)/1.13 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
      letter-spacing: -0.048em; overflow-wrap: anywhere; padding: 4px 0; text-wrap: pretty;
    }
    #lep-dialog button.lep-line:hover { color: var(--lep-muted); }
    #lep-dialog .lep-lines[data-timed="true"] .lep-line:not([aria-current="true"], :hover, :focus-visible) {
      color: transparent;
      text-shadow: 0 0 0.062em var(--lep-quiet);
    }
    #lep-dialog :is(button, p).lep-line[aria-current="true"], #lep-dialog [data-timed="false"] :is(button, p).lep-line { color: var(--lep-ink); }
    #lep-dialog .lep-status { padding-block: min(18vh, 145px); color: var(--lep-muted); max-width: 33ch; font-size: clamp(1rem, 1.8vw, 1.45rem); }
    #lep-dialog .lep-credit { position: absolute; bottom: 3px; right: 0; color: var(--lep-muted); font-size: 0.69rem; pointer-events: none; }
    #lep-dialog .lep-dock {
      inset-inline: 0; inset-block-end: var(--lep-edge); margin-inline: auto;
      width: min(calc(100% - 2 * var(--lep-inset)), 960px); border-radius: 26px; padding: 8px clamp(12px, 2vw, 28px);
      display: grid; align-items: center;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 1.65fr) minmax(0, 1fr); gap: clamp(10px, 2vw, 28px);
    }
    #lep-dialog .lep-volume {
      min-width: 0; display: flex; align-items: center; gap: 8px; color: var(--lep-muted); grid-column: 1;
    }
    #lep-dialog .lep-volume svg { flex: none; }
    #lep-dialog .lep-volume input { margin: 0; min-width: 0; width: min(100%, 122px); height: 30px; cursor: pointer; }
    #lep-dialog .lep-playback { min-width: 0; display: grid; gap: 4px; }
    #lep-dialog .lep-transport { display: flex; align-items: center; justify-content: center; gap: 10px; }
    #lep-dialog .lep-position {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
      color: var(--lep-muted); font: 600 0.76rem/1 "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums;
    }
    #lep-dialog .lep-position input { margin: 0; min-width: 0; width: 100%; cursor: pointer; }
    #lep-dialog .lep-follow {
      grid-column: 3; justify-self: end; display: flex; align-items: center; gap: 6px; min-height: 44px;
      font-size: 0.82rem; color: var(--lep-muted); cursor: pointer;
    }
    #lep-dialog .lep-options {
      position: absolute; z-index: 3; inset-block-start: clamp(64px, 9vh, 110px);
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
      html[data-lep-motion="true"] #lep-dialog :is(button, p).lep-line { transition: color 160ms ease; }
      html[data-lep-motion="true"] #lep-dialog :is(.lep-header, .lep-dock) {
        transition: opacity 220ms ease, translate 260ms ease, visibility 0s;
      }
      html[data-lep-motion="true"] #lep-dialog[data-idle="true"] :is(.lep-header, .lep-dock) {
        transition-delay: 0s, 0s, 220ms;
      }
      html[data-lep-motion="true"] #lep-dialog[data-idle="true"] .lep-header { translate: 0 -8px; }
      html[data-lep-motion="true"] #lep-dialog[data-idle="true"] .lep-dock { translate: 0 10px; }
      #lep-dialog[data-drift="true"] .lep-ambient::before { animation: lep-drift 32s ease-in-out infinite alternate; }
      #lep-dialog[data-palette="album"][data-drift="true"] .lep-ambient[data-texture]::before { animation: none; }
      #lep-dialog[data-drift="true"] .lep-texture { animation: lep-art-drift 24s ease-in-out infinite alternate; }
      #lep-dialog[data-inactive="true"] .lep-ambient::before,
      #lep-dialog[data-inactive="true"] .lep-texture { animation-play-state: paused; }
    }
    @keyframes lep-drift {
      0% { translate: -2% 1%; scale: 1.02; }
      52% { translate: 3% -2%; scale: 1.09; }
      100% { translate: 1% 3%; scale: 1.04; }
    }
    @keyframes lep-art-drift {
      0% { transform: translate(-5%, 3%) rotate(-6deg) skewX(-4deg) scale(1.03, 1.12); }
      48% { transform: translate(4%, -5%) rotate(6deg) skewX(4deg) scale(1.21, 1.05); }
      100% { transform: translate(5%, 4%) rotate(-3deg) skewX(-5deg) scale(1.07, 1.25); }
    }
    @media (max-width: 720px) {
      #lep-dialog .lep-header { grid-template-columns: auto 1fr; }
      #lep-dialog .lep-layout { grid-column: 1; justify-self: start; }
      #lep-dialog .lep-actions { grid-column: 2; }
      #lep-dialog .lep-body { gap: 8px; }
      #lep-dialog[data-layout="both"] .lep-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); padding-top: calc(var(--lep-edge) + 52px); }
      #lep-dialog[data-layout="both"] .lep-card { width: min(56vw, 29vh); }
      #lep-dialog[data-layout="both"] .lep-cover { border-radius: 12px; }
      #lep-dialog .lep-scroll { --lep-lyric-mask: linear-gradient(to bottom, transparent, black 12%, black 68%, transparent); }
      #lep-dialog .lep-dock { grid-template-columns: minmax(0, 1fr) minmax(0, auto); padding: 8px 14px; gap: 4px; }
      #lep-dialog .lep-follow { grid-column: 2; grid-row: 1; font-size: 0.75rem; min-height: 30px; }
      #lep-dialog .lep-playback { grid-column: 1 / -1; }
      #lep-dialog .lep-transport { gap: 4px; }
      #lep-dialog .lep-transport .lep-icon, #lep-dialog .lep-play { width: 44px; height: 44px; }
    }
    @media (max-height: 540px) and (min-width: 721px) {
      #lep-dialog .lep-track .lep-card { width: min(100%, 47vh); }
    }
    @media (forced-colors: active) {
      #lep-dialog .lep-scroll { --lep-lyric-mask: none; }
      #lep-dialog .lep-lines[data-timed="true"] .lep-line:not([aria-current="true"], :hover, :focus-visible) {
        color: CanvasText; text-shadow: none;
      }
    }
  `;

  initialize();
})();
