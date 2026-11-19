// NAME: Letras en pantalla
// VERSION: 1.0.0
// DESCRIPTION: Letras nativas, portadas y controles en pantalla completa.

(() => {
  "use strict";

  const root = document.documentElement;
  if (root.dataset.lepLoaded) return;
  root.dataset.lepLoaded = "true";

  const TITLE = "Letras en pantalla";
  const KEY = "letras-en-pantalla:config";
  const NATIVE_FULL = 'button[data-testid="fullscreen-mode-button"]';
  const NATIVE_LYRICS = 'button[data-testid="lyrics-button"]';
  const SOURCE = '.lyrics-lyrics-container, [data-testid="lyrics-container"], .lyrics-lyrics-contentWrapper';
  const LINE = '.lyrics-lyricsContent-lyric, [data-testid="lyrics-line"]';
  const TEXT = ".lyrics-lyricsContent-text";
  const ACTIVE = '.lyrics-lyricsContent-active, [aria-current="true"]';
  const SEEKABLE = '.lyrics-lyricsContent-isInteractive, button, [role="button"]';
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
  const settings = { palette: "mora", size: "standard", motion: true, follow: true, native: true, style: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const key of ["motion", "follow", "native", "style"]) {
      if (typeof saved?.[key] === "boolean") settings[key] = saved[key];
    }
    if (["mora", "oceano", "tinta"].includes(saved?.palette)) settings.palette = saved.palette;
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
    stage.ui.follow.checked = settings.follow;
    highlight(stage, settings.follow);
  }

  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Keep session preferences. */ }
    applySettings();
  }

  function track() {
    const state = player.data;
    const item = state?.item;
    const meta = item?.metadata ?? {};
    const uri = item?.uri || "";
    const ad = uri.startsWith("spotify:ad:") || item?.type === "ad" || state?.is_ad === true ||
      [meta.is_ad, meta.is_advertisement, meta.entity_type === "ad"].some((value) => value === true || value === "true");
    const artists = Array.isArray(item?.artists)
      ? item.artists.map((artist) => artist.name).filter(Boolean).join(", ")
      : Object.keys(meta).filter((key) => /^artist_name(?::\d+)?$/.test(key)).map((key) => meta[key]).filter(Boolean).join(", ");
    return { uri, ad, title: item?.name || meta.title || "", artists: artists || meta.album_title || "",
      art: artwork(meta.image_large_url || meta.image_xlarge_url || meta.image_url || item?.album?.images?.[0]?.url) };
  }

  function artwork(value) {
    if (typeof value !== "string") return "";
    if (/^spotify:image:[a-f0-9]{40}$/i.test(value)) return "https://i.scdn.co/image/" + value.slice(14);
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password &&
          (url.hostname === "i.scdn.co" || url.hostname.endsWith(".spotifycdn.com"))) return url.href;
    } catch { /* Optional image. */ }
    return "";
  }

  function render(entered) {
    const dialog = document.createElement("dialog");
    dialog.id = "lep-dialog";
    dialog.setAttribute("aria-labelledby", "lep-title");
    dialog.dataset.palette = settings.palette;
    dialog.innerHTML = `
      <header class="lep-header">
        <h1 id="lep-title">Letras en pantalla</h1>
        <div class="lep-actions">
          <label class="lep-follow"><input data-ui="follow" type="checkbox"> Seguir letra</label>
          <button type="button" class="lep-icon" data-ui="tune" aria-label="Ajustes" title="Ajustes" aria-expanded="false" aria-controls="lep-options">${icon("tune", 20)}</button>
          <button type="button" class="lep-icon" data-ui="exit" aria-label="Salir de pantalla completa" title="Salir (Esc)" autofocus>${icon("close", 20)}</button>
        </div>
      </header>
      <div class="lep-body">
        <section class="lep-track" aria-label="Reproduciendo">
          <div class="lep-cover"><img data-ui="cover" alt="" decoding="async" referrerpolicy="no-referrer" hidden></div>
          <h2 data-ui="title"></h2><p data-ui="artist"></p>
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
        </section>
        <section class="lep-lyrics" aria-label="Letra">
          <div class="lep-scroll" data-ui="scroll" tabindex="0" aria-label="Versos">
            <p class="lep-status" data-ui="status" role="status"></p>
            <div data-ui="lines" class="lep-lines" hidden></div>
          </div>
          <footer class="lep-credit" data-ui="credit" hidden></footer>
        </section>
      </div>
      <section class="lep-options" id="lep-options" data-ui="options" aria-label="Ajustes" hidden>
        <label>Tema <select data-setting="palette" aria-label="Tema"><option value="mora">Mora</option><option value="oceano">Océano</option><option value="tinta">Tinta</option></select></label>
        <label>Tamaño de letra <select data-setting="size" aria-label="Tamaño de letra"><option value="compact">Compacto</option><option value="standard">Mediano</option><option value="large">Grande</option></select></label>
        <label><input data-setting="motion" type="checkbox"> Desplazamiento suave</label>
        <label><input data-setting="style" type="checkbox"> Mejorar la vista normal de letras</label>
        <label><input data-setting="native" type="checkbox"> Usar el botón de pantalla completa de Spotify</label>
      </section>`;
    const ui = Object.fromEntries([...dialog.querySelectorAll("[data-ui]")].map((node) => [node.dataset.ui, node]));
    const state = { dialog, ui, entered, controller: new AbortController(),
      rows: [], active: -1, frame: 0, deadline: 0, dirty: false, track: null, previous: null,
      routeFrom: history?.location?.pathname, clickedLyrics: false, clock: "", seeking: false };
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
    on(ui.cover, "error", () => { ui.cover.hidden = true; });
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

    state.onSong = () => changeTrack(state);
    state.onPlayback = () => updateClock(state);
    player.addEventListener("songchange", state.onSong);
    player.addEventListener("onplaypause", state.onPlayback);
    player.addEventListener("onprogress", state.onPlayback);
    on(dialog, "close", () => dispose(state));
    on(document, "fullscreenchange", () => {
      if (state.entered && !document.fullscreenElement) dialog.close();
    });
    on(document, "visibilitychange", () => {
      if (document.hidden) stopWatching(state);
      else {
        changeTrack(state);
        if (stage === state) watchLyrics(state);
      }
    });
    document.body.append(dialog);
    changeTrack(state);
    if (stage === state) dialog.showModal();
  }

  function inLyrics() {
    return /^\/lyrics(?:\/|$)/.test(history?.location?.pathname || "");
  }

  function dispose(state) {
    if (stage !== state) return;
    stage = null;
    playbar.active = false;
    state.controller.abort();
    stopWatching(state);
    player.removeEventListener("songchange", state.onSong);
    player.removeEventListener("onplaypause", state.onPlayback);
    player.removeEventListener("onprogress", state.onPlayback);
    state.dialog.remove();
    if (state.clickedLyrics && state.routeFrom && inLyrics()) history?.goBack?.();
    if (state.entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
  }

  function changeTrack(state) {
    const current = track();
    if (current.ad) {
      if (state.dialog.open) state.dialog.close();
      else dispose(state);
      return;
    }
    const old = state.track;
    const { ui } = state;
    state.track = current;
    if (!old || old.title !== current.title || old.artists !== current.artists || old.art !== current.art) {
      ui.title.textContent = current.title || "Sin reproducción";
      ui.artist.textContent = current.artists;
      ui.cover.hidden = !current.art;
      if (current.art) ui.cover.src = current.art;
      else ui.cover.removeAttribute("src");
    }
    if (!old || old.uri !== current.uri || (!old.uri && old.title !== current.title)) {
      if (state.rows.length) state.previous = state.rows;
      state.rows = [];
      state.active = -1;
      state.clock = "";
      state.seeking = false;
      ui.lines.replaceChildren();
      ui.credit.hidden = true;
      ui.scroll.scrollTop = 0;
      status(state, current.title ? "Buscando letra…" : "Reproduce una canción para ver su letra.");
      if (current.title && !inLyrics() && !document.querySelector(SOURCE)) {
        const button = document.querySelector(NATIVE_LYRICS);
        if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
          state.clickedLyrics = true;
          button.click();
        }
      }
      watchLyrics(state);
    }
    updateClock(state);
  }

  function time(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000)) || 0;
    return String(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");
  }

  function updateClock(state) {
    if (document.hidden) return;
    const { ui } = state;
    const playing = player.isPlaying();
    if (ui.play.dataset.playing !== String(playing)) {
      ui.play.dataset.playing = String(playing);
      ui.play.innerHTML = icon(playing ? "pause" : "play");
      ui.play.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
    }
    const duration = Math.max(0, Number(player.getDuration()) || 0);
    const progress = Math.max(0, Number(player.getProgress()) || 0);
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
    if (document.hidden || stage !== state || !state.track?.title) return;
    const findSource = () => document.querySelector(SOURCE) ||
      (inLyrics() && document.querySelector(TEXT)?.closest(".Root__main-view, #main, main"));
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
          attributeName === "aria-current" || (attributeName === "class" &&
            (target.matches(ACTIVE) || oldValue?.split(/\s+/).includes("lyrics-lyricsContent-active"))));
        if (rebuild || timing || !state.rows.length) queueRead(state, rebuild || !state.rows.length);
      });
      state.observer.observe(source, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeOldValue: true, attributeFilter: ["class", "aria-current"] });
      if (host) state.observer.observe(host, { childList: true });
      queueRead(state, true);
    } else {
      state.observer = new MutationObserver(() => {
        if (findSource()) watchLyrics(state);
      });
      state.observer.observe(document.querySelector(".Root__main-view, #main, main") || document.body, { childList: true, subtree: true });
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
    const nodes = candidates.length ? candidates : [...new Set([...source.querySelectorAll(TEXT)].map((text) =>
      text.closest(SEEKABLE) || text))];
    const rows = nodes
      .map((node) => ({
        node,
        target: node.matches(SEEKABLE) ? node : node.querySelector(SEEKABLE),
        text: (candidates.length && node.querySelector(TEXT)?.textContent || node.textContent || "").trim(),
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
    if (!state.rows.length || document.hidden) return;
    const index = state.rows.findIndex(({ node }) => node.matches(ACTIVE) || node.querySelector(ACTIVE));
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

  function open() {
    if (stage || opening || track().ad || (document.fullscreenElement && document.fullscreenElement !== root)) return false;
    opening = true;
    const full = !document.fullscreenElement && root.requestFullscreen
      ? root.requestFullscreen().then(() => true, () => false)
      : Promise.resolve(false);
    full.then((entered) => {
      opening = false;
      if (track().ad) {
        if (entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
        return;
      }
      playbar.active = true;
      try { render(entered); } catch (error) {
        if (stage) dispose(stage);
        else if (entered && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
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
      --lep-bg: #150f1b; --lep-side: #311c32; --lep-ink: #fbf3f2;
      --lep-muted: #c6b4c4; --lep-quiet: #ad97ae; --lep-accent: #ffb8a7;
      --lep-size: clamp(1.75rem, 3.35vw, 4rem);
      color-scheme: dark; color: var(--lep-ink);
      background: linear-gradient(126deg, var(--lep-side), var(--lep-bg) 65%);
      box-sizing: border-box; position: fixed; inset: 0; margin: 0; border: 0;
      padding: clamp(16px, 3vw, 44px) clamp(20px, 5.2vw, 100px);
      width: 100%; height: 100%; max-width: none; max-height: none; overflow: hidden;
      font: 500 16px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    }
    #lep-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: clamp(12px, 3vh, 40px); }
    #lep-dialog:modal, #lep-dialog::backdrop { overscroll-behavior: contain; }
    #lep-dialog::backdrop { background: #100e17; overflow: hidden; }
    #lep-dialog[data-palette="oceano"] { --lep-bg: #0b1720; --lep-side: #153a46; --lep-muted: #b7cdd3; --lep-quiet: #9ab7bd; --lep-accent: #ade9df; }
    #lep-dialog[data-palette="tinta"] { --lep-bg: #101014; --lep-side: #26242d; --lep-muted: #c0bdcb; --lep-quiet: #a8a4b6; --lep-accent: #d6cbff; }
    html[data-lep-size="compact"] #lep-dialog { --lep-size: clamp(1.45rem, 2.65vw, 3.1rem); }
    html[data-lep-size="large"] #lep-dialog { --lep-size: clamp(2rem, 4.2vw, 4.85rem); }
    #lep-dialog * { box-sizing: border-box; }
    #lep-dialog [hidden] { display: none !important; }
    #lep-dialog :is(h1, h2, p) { margin: 0; }
    #lep-dialog button { margin: 0; font: inherit; color: inherit; border: 0; cursor: pointer; }
    #lep-dialog input { accent-color: var(--lep-accent); }
    #lep-dialog :is(button, input, select, [tabindex]):focus-visible { outline: 2px solid var(--lep-accent); outline-offset: 3px; }
    #lep-dialog .lep-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid #ffffff29; padding-bottom: clamp(8px, 1.6vh, 18px); }
    #lep-dialog h1 { font-size: clamp(0.95rem, 1.45vw, 1.25rem); font-weight: 700; letter-spacing: 0.015em; }
    #lep-dialog :is(.lep-actions, .lep-transport) { display: flex; align-items: center; gap: 10px; }
    #lep-dialog .lep-follow { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.88rem; color: var(--lep-muted); cursor: pointer; }
    #lep-dialog :is(.lep-icon, .lep-play) { display: grid; place-items: center; padding: 0; border-radius: 50%; width: 44px; height: 44px; flex: none; background: transparent; }
    #lep-dialog .lep-icon:hover { background: #ffffff17; }
    #lep-dialog .lep-play { background: var(--lep-accent); color: #17131a; width: 54px; height: 54px; }
    #lep-dialog .lep-play:hover { background: var(--lep-ink); }
    #lep-dialog .lep-body { min-height: 0; display: grid; grid-template-columns: minmax(190px, 0.79fr) minmax(0, 1.21fr); gap: clamp(24px, 6vw, 112px); }
    #lep-dialog .lep-track { min-width: 0; min-height: 0; width: min(100%, 435px); align-self: center; justify-self: center; display: grid; gap: 10px; }
    #lep-dialog .lep-cover { width: min(100%, 46vh); aspect-ratio: 1; margin-bottom: clamp(3px, 1.6vh, 20px); overflow: hidden; border-radius: 14px; background: linear-gradient(145deg, #ffffff1a, transparent), var(--lep-side); border: 1px solid #ffffff20; }
    #lep-dialog .lep-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #lep-dialog .lep-track h2 { font-family: Georgia, serif; font-weight: 500; font-size: clamp(1.4rem, 3vw, 3rem); line-height: 1.07; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    #lep-dialog .lep-track p { color: var(--lep-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #lep-dialog .lep-transport { margin-top: clamp(0px, 1vh, 10px); gap: 12px; }
    #lep-dialog .lep-position { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; color: var(--lep-muted); font: 600 0.8rem/1 "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    #lep-dialog .lep-position input { margin: 0; min-width: 0; width: 100%; cursor: pointer; }
    #lep-dialog .lep-lyrics { min-width: 0; min-height: 0; border-left: 1px solid #ffffff22; display: grid; grid-template-rows: minmax(0, 1fr) auto; padding-left: clamp(18px, 4vw, 78px); }
    #lep-dialog .lep-scroll { overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #ffffff42 transparent; padding: 6px; }
    #lep-dialog .lep-lines { padding-block: min(26vh, 220px) min(53vh, 460px); display: grid; gap: clamp(8px, 1.8vh, 20px); }
    #lep-dialog .lep-lines[data-timed="false"] { padding-block: clamp(12px, 6vh, 90px); }
    #lep-dialog :is(button, p).lep-line { text-align: start; background: transparent; border-radius: 6px; color: var(--lep-quiet); font: 740 var(--lep-size)/1.12 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -0.044em; overflow-wrap: anywhere; padding: 3px 0; text-wrap: pretty; }
    #lep-dialog button.lep-line:hover { color: var(--lep-muted); }
    #lep-dialog :is(button, p).lep-line[aria-current="true"], #lep-dialog [data-timed="false"] :is(button, p).lep-line { color: var(--lep-ink); }
    #lep-dialog .lep-line[aria-current="true"] { text-decoration: underline 0.045em var(--lep-accent); text-underline-offset: 0.16em; }
    #lep-dialog .lep-status { padding-block: min(20vh, 180px); color: var(--lep-muted); max-width: 30ch; font-size: clamp(1.1rem, 2vw, 1.65rem); }
    #lep-dialog .lep-credit { color: var(--lep-muted); font-size: 0.8rem; padding: 8px 6px 0; }
    #lep-dialog .lep-options { position: absolute; z-index: 1; inset-block-start: clamp(68px, 10vh, 118px); inset-inline-end: clamp(20px, 5.2vw, 100px); width: min(calc(100% - 40px), 345px); background: var(--lep-bg); border: 1px solid #ffffff43; border-radius: 14px; padding: 16px; display: grid; gap: 12px; }
    #lep-dialog .lep-options label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.9rem; }
    #lep-dialog .lep-options label:has(input) { justify-content: start; }
    #lep-dialog .lep-options select { color: var(--lep-ink); font: inherit; background: var(--lep-side); border: 1px solid #ffffff50; padding: 6px 8px; border-radius: 5px; }
    html[data-lep-style="true"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.35rem, 2.9vw, 3.3rem) !important; line-height: 1.18 !important; letter-spacing: -0.027em; }
    html[data-lep-style="true"][data-lep-size="compact"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.2rem, 2.4vw, 2.7rem) !important; }
    html[data-lep-style="true"][data-lep-size="large"] :is(.lyrics-lyricsContent-lyric, .lyrics-lyricsContent-text) { font-size: clamp(1.65rem, 3.5vw, 4rem) !important; }
    html[data-lep-style="true"] :is(.lyrics-lyricsContent-lyric.lyrics-lyricsContent-active, [aria-current="true"] > .lyrics-lyricsContent-text) { text-decoration: underline 0.04em currentColor; text-underline-offset: 0.16em; }
    @media (prefers-reduced-motion: no-preference) {
      html[data-lep-motion="true"] #lep-dialog :is(button, p).lep-line { transition: color 150ms ease; }
    }
    @media (max-width: 690px) {
      #lep-dialog .lep-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
      #lep-dialog .lep-track { width: 100%; grid-template-columns: 66px minmax(0, 1fr) auto; grid-template-rows: auto auto auto; align-items: center; gap: 4px 12px; }
      #lep-dialog .lep-cover { width: 100%; grid-row: 1 / span 2; margin: 0; border-radius: 8px; }
      #lep-dialog .lep-transport { grid-column: 3; grid-row: 1 / span 2; margin: 0; gap: 0; }
      #lep-dialog .lep-position { grid-column: 1 / -1; }
      #lep-dialog .lep-track h2 { grid-column: 2; grid-row: 1; font-size: 1.3rem; }
      #lep-dialog .lep-track p { grid-column: 2; grid-row: 2; font-size: 0.85rem; }
      #lep-dialog .lep-lyrics { padding: 8px 0 0; border-left: 0; border-top: 1px solid #ffffff22; }
      #lep-dialog .lep-lines { padding-block: 9vh 58vh; }
      #lep-dialog .lep-play { width: 44px; height: 44px; }
    }
    @media (max-width: 410px) {
      #lep-dialog { padding-inline: 14px; }
      #lep-dialog :is(.lep-header, .lep-actions) { gap: 4px; }
      #lep-dialog .lep-follow { font-size: 0.78rem; }
      #lep-dialog .lep-track { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 4px 6px; }
    }
    @media (max-height: 530px) and (min-width: 691px) {
      #lep-dialog .lep-cover { width: min(100%, 31vh); margin-bottom: 0; }
    }
  `;

  initialize();
})();
