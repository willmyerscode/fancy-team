/**
 * Fancy Team for Squarespace
 * Rebuilds a list section into a spotlight layout: one large portrait on soft accent
 * shapes, with a list of names beside it that gently auto-cycles.
 *
 * Mount: give the list section an Anchor Link that starts with "my-fancy-team".
 * Data: read from the section's own data-current-context JSON, so names, roles,
 * photos and buttons are still edited in Squarespace as usual.
 *
 * Settings (optional, in Code Injection before this script):
 *   window.wmFancyTeamSettings = { autoCycle: true, cycleSpeed: 5000 };
 **/

(function () {
  "use strict";

  const PLUGIN = "fancy-team";
  const NAMESPACE = "wmFancyTeam";
  const MOUNT_ID = "my-fancy-team";
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document
    .querySelectorAll(`[id^="${MOUNT_ID}"]`)
    .forEach(el => el.setAttribute("data-wm-plugin", PLUGIN));

  const parseAttr = value => {
    if (value === "true") return true;
    if (value === "false") return false;
    const num = parseFloat(value);
    return isNaN(num) || num.toString() !== value ? value : num;
  };

  const emitEvent = (type, detail = {}, el = document) =>
    el.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: true, detail }));

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const stripTags = html => {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.trim();
  };

  class FancyTeam {
    static defaultSettings = {
      autoCycle: true,
      cycleSpeed: 5000,
    };

    static get userSettings() {
      return window[NAMESPACE + "Settings"] || {};
    }

    constructor(el) {
      this.el = el;
      this.original = el.querySelector(".user-items-list");
      this.settings = { ...FancyTeam.defaultSettings, ...FancyTeam.userSettings, ...this.instanceSettings };
      this.cleanups = [];
      this.readData();
      this.init();
    }

    // data-auto-cycle="false" or data-cycle-speed="7000" on the section override the defaults.
    get instanceSettings() {
      const out = {};
      for (const [key, value] of Object.entries(this.el.dataset)) {
        if (key in FancyTeam.defaultSettings) out[key] = parseAttr(value);
      }
      return out;
    }

    readData() {
      const holder = this.el.querySelector("[data-current-context]");
      const context = JSON.parse(holder.getAttribute("data-current-context"));
      const titleEl = this.el.querySelector(".list-section-title");
      this.title = titleEl ? titleEl.textContent.trim() : "";
      this.members = (context.userItems || []).map(item => {
        const image = item.image || {};
        const focal = image.mediaFocalPoint || { x: 0.5, y: 0.5 };
        return {
          name: item.title || "",
          role: stripTags(item.description),
          image: image.assetUrl ? `${image.assetUrl}?format=1000w` : "",
          alt: image.altText || item.title || "",
          position: `${focal.x * 100}% ${focal.y * 100}%`,
          buttonText: item.button?.buttonText || "",
          buttonLink: item.button?.buttonLink || "",
          buttonNewWindow: !!item.button?.buttonNewWindow,
        };
      });
    }

    init() {
      emitEvent(`${NAMESPACE}:beforeInit`, { instance: this }, this.el);
      this.root = document.createElement("div");
      this.root.className = PLUGIN;
      this.root.innerHTML = this.render();
      this.original.style.display = "none";
      this.original.after(this.root);
      this.bindEvents();
      this.revealOnScroll();
      emitEvent(`${NAMESPACE}:afterInit`, { instance: this }, this.el);
    }

    destroy() {
      this.cleanups.forEach(fn => fn());
      this.cleanups = [];
      this.root?.remove();
      this.original.style.display = "";
      delete this.el.dataset.loadingState;
      emitEvent(`${NAMESPACE}:destroy`, { instance: this }, this.el);
    }

    buttonHtml(m) {
      if (!m.buttonLink || !m.buttonText) return "";
      const target = m.buttonNewWindow ? ' target="_blank" rel="noopener"' : "";
      return `<a class="ft-link" href="${escapeHtml(m.buttonLink)}"${target}>${escapeHtml(m.buttonText)}<span aria-hidden="true"> →</span></a>`;
    }

    imgHtml(m) {
      if (!m.image) return `<div class="ft-img ft-img--empty"></div>`;
      return `<img class="ft-img" src="${m.image}" alt="${escapeHtml(m.alt)}" loading="lazy" style="object-position:${m.position}">`;
    }

    render() {
      const frames = this.members
        .map(
          (m, i) => `
          <figure class="ft-frame${i === 0 ? " is-active" : ""}" aria-hidden="${i !== 0}">
            ${this.imgHtml(m)}
          </figure>`
        )
        .join("");
      const people = this.members
        .map(
          (m, i) => `
          <li>
            <button type="button" class="ft-person${i === 0 ? " is-active" : ""}" aria-pressed="${i === 0}">
              <span class="ft-num">${String(i + 1).padStart(2, "0")}</span>
              <span class="ft-text">
                <span class="ft-name">${escapeHtml(m.name)}</span>
                <span class="ft-role">${escapeHtml(m.role)}</span>
              </span>
              <span class="ft-progress" aria-hidden="true"></span>
            </button>
            ${this.buttonHtml(m)}
          </li>`
        )
        .join("");
      const title = this.title ? `<h2 class="ft-title">${escapeHtml(this.title)}</h2>` : "";
      return `
        ${title}
        <div class="ft-spotlight" data-ft-reveal>
          <div class="ft-stage">
            <div class="ft-blob" aria-hidden="true"></div>
            <div class="ft-blob ft-blob--two" aria-hidden="true"></div>
            ${frames}
          </div>
          <ol class="ft-list">${people}</ol>
        </div>`;
    }

    bindEvents() {
      const frames = [...this.root.querySelectorAll(".ft-frame")];
      const people = [...this.root.querySelectorAll(".ft-person")];
      const wrap = this.root.querySelector(".ft-spotlight");
      const { autoCycle, cycleSpeed } = this.settings;
      let active = 0;
      let timer = null;

      const select = i => {
        active = i;
        frames.forEach((f, j) => {
          f.classList.toggle("is-active", j === i);
          f.setAttribute("aria-hidden", j !== i);
        });
        people.forEach((p, j) => {
          p.classList.toggle("is-active", j === i);
          p.setAttribute("aria-pressed", j === i);
        });
        emitEvent(`${NAMESPACE}:change`, { instance: this, index: i }, this.el);
      };
      const start = () => {
        if (!autoCycle || REDUCED_MOTION || timer || people.length < 2) return;
        wrap.classList.add("is-cycling");
        wrap.style.setProperty("--ft-cycle", `${cycleSpeed}ms`);
        timer = setInterval(() => select((active + 1) % people.length), cycleSpeed);
      };
      const stop = () => {
        clearInterval(timer);
        timer = null;
        wrap.classList.remove("is-cycling");
      };

      people.forEach((p, i) => {
        p.addEventListener("mouseenter", () => select(i));
        p.addEventListener("focus", () => select(i));
        p.addEventListener("click", () => select(i));
      });
      wrap.addEventListener("mouseenter", stop);
      wrap.addEventListener("focusin", stop);
      wrap.addEventListener("mouseleave", start);
      start();
      this.cleanups.push(stop);
    }

    revealOnScroll() {
      const targets = this.root.querySelectorAll("[data-ft-reveal]");
      if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
        targets.forEach(t => t.classList.add("is-revealed"));
        return;
      }
      const io = new IntersectionObserver(
        entries =>
          entries.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add("is-revealed");
            io.unobserve(e.target);
          }),
        { threshold: 0.15 }
      );
      targets.forEach(t => io.observe(t));
      this.cleanups.push(() => io.disconnect());
    }
  }

  function init() {
    document
      .querySelectorAll(`[data-wm-plugin="${PLUGIN}"]:not([data-loading-state])`)
      .forEach(el => {
        el.dataset.loadingState = "loading";
        try {
          el[NAMESPACE] = new FancyTeam(el);
          el.dataset.loadingState = "loaded";
        } catch (error) {
          el.dataset.loadingState = "error";
          console.error(`[${PLUGIN}] failed to initialize`, error);
        }
      });
  }

  window[NAMESPACE] = window[NAMESPACE] || { init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Inside the Squarespace editor, hand the native section back when edit mode starts.
  if (window.self !== window.top) {
    new MutationObserver((_, observer) => {
      if (!document.body.classList.contains("sqs-edit-mode-active")) return;
      document.querySelectorAll(`[data-wm-plugin="${PLUGIN}"]`).forEach(el => el[NAMESPACE]?.destroy());
      observer.disconnect();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
