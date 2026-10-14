/**
 * PROTOTYPE — Fancy Team for Squarespace
 * Rebuilds the list section with id "my-fancy-team" from its own data-current-context JSON.
 * Three variants, switchable with ?team-variant= or the floating bar (shown on localhost or with ?team-variant=):
 *   spotlight — one big portrait, a name list beside it, gentle auto-cycle
 *   arches    — tall arch cards on site accent colours, staggered rise + idle float
 *   index     — big typographic roster, colour sweep on hover, portrait follows the cursor
 **/

(function () {
  "use strict";

  const PLUGIN = "fancy-team";
  const NAMESPACE = "wmFancyTeam";
  const MOUNT_ID = "my-fancy-team";
  const VARIANTS = {
    spotlight: "Spotlight",
    arches: "Arches",
    index: "Index",
  };
  // The variant switcher shows when the script loads from localhost, or when ?team-variant= is in the URL.
  const IS_PROTOTYPE =
    /localhost|127\.0\.0\.1/.test(document.currentScript?.src || "") ||
    new URLSearchParams(location.search).has("team-variant");
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document
    .querySelectorAll(`[id^="${MOUNT_ID}"]`)
    .forEach(el => el.setAttribute("data-wm-plugin", PLUGIN));

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const stripTags = html => {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.trim();
  };

  function currentVariant(el) {
    const fromUrl = new URLSearchParams(location.search).get("team-variant");
    const choice = fromUrl || el.dataset.variant || window[NAMESPACE + "Settings"]?.variant;
    return VARIANTS[choice] ? choice : "spotlight";
  }

  class FancyTeam {
    constructor(el) {
      this.el = el;
      this.original = el.querySelector(".user-items-list");
      this.cleanups = [];
      this.readData();
      this.init();
    }

    readData() {
      const holder = this.el.querySelector("[data-current-context]");
      const context = JSON.parse(holder.getAttribute("data-current-context"));
      const titleEl = this.el.querySelector(".list-section-title");
      this.title = titleEl ? titleEl.textContent.trim() : "";
      this.members = (context.userItems || []).map((item, i) => {
        const image = item.image || {};
        const focal = image.mediaFocalPoint || { x: 0.5, y: 0.5 };
        return {
          index: i,
          name: item.title || "",
          roleHtml: item.description || "",
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
      this.variant = currentVariant(this.el);
      this.root = document.createElement("div");
      this.root.className = `${PLUGIN}`;
      this.root.dataset.variant = this.variant;
      this.root.innerHTML = this[`render_${this.variant}`]();
      this.original.style.display = "none";
      this.original.after(this.root);
      this[`bind_${this.variant}`]?.();
      this.revealOnScroll();
    }

    destroy() {
      this.cleanups.forEach(fn => fn());
      this.cleanups = [];
      this.root?.remove();
      this.original.style.display = "";
    }

    switchTo(variant) {
      this.destroy();
      this.el.dataset.variant = variant;
      this.init();
    }

    /* Shared bits */

    titleHtml() {
      return this.title ? `<h2 class="ft-title">${escapeHtml(this.title)}</h2>` : "";
    }

    buttonHtml(m) {
      if (!m.buttonLink || !m.buttonText) return "";
      const target = m.buttonNewWindow ? ' target="_blank" rel="noopener"' : "";
      return `<a class="ft-link" href="${escapeHtml(m.buttonLink)}"${target}>${escapeHtml(m.buttonText)}<span aria-hidden="true"> →</span></a>`;
    }

    imgHtml(m, cls = "", attrs = "") {
      if (!m.image) return `<div class="ft-img ft-img--empty ${cls}" ${attrs}></div>`;
      return `<img class="ft-img ${cls}" ${attrs} src="${m.image}" alt="${escapeHtml(m.alt)}" loading="lazy" style="object-position:${m.position}">`;
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

    /* Variant: spotlight */

    render_spotlight() {
      const stage = this.members
        .map(
          (m, i) => `
          <figure class="ft-spot-frame${i === 0 ? " is-active" : ""}" data-index="${i}" aria-hidden="${i !== 0}">
            ${this.imgHtml(m)}
          </figure>`
        )
        .join("");
      const list = this.members
        .map(
          (m, i) => `
          <li>
            <button type="button" class="ft-spot-name${i === 0 ? " is-active" : ""}" data-index="${i}" aria-pressed="${i === 0}">
              <span class="ft-spot-num">${String(i + 1).padStart(2, "0")}</span>
              <span class="ft-spot-text">
                <span class="ft-name">${escapeHtml(m.name)}</span>
                <span class="ft-role">${escapeHtml(m.role)}</span>
              </span>
              <span class="ft-spot-progress" aria-hidden="true"></span>
            </button>
            ${this.buttonHtml(m)}
          </li>`
        )
        .join("");
      return `
        ${this.titleHtml()}
        <div class="ft-spot" data-ft-reveal>
          <div class="ft-spot-stage">
            <div class="ft-blob" aria-hidden="true"></div>
            <div class="ft-blob ft-blob--two" aria-hidden="true"></div>
            ${stage}
          </div>
          <ol class="ft-spot-list">${list}</ol>
        </div>`;
    }

    bind_spotlight() {
      const frames = [...this.root.querySelectorAll(".ft-spot-frame")];
      const names = [...this.root.querySelectorAll(".ft-spot-name")];
      const wrap = this.root.querySelector(".ft-spot");
      let active = 0;
      let timer = null;
      const CYCLE_MS = 5000;

      const select = i => {
        active = i;
        frames.forEach((f, j) => {
          f.classList.toggle("is-active", j === i);
          f.setAttribute("aria-hidden", j !== i);
        });
        names.forEach((n, j) => {
          n.classList.toggle("is-active", j === i);
          n.setAttribute("aria-pressed", j === i);
        });
      };
      const start = () => {
        if (REDUCED_MOTION || timer) return;
        wrap.classList.add("is-cycling");
        wrap.style.setProperty("--ft-cycle", `${CYCLE_MS}ms`);
        timer = setInterval(() => select((active + 1) % names.length), CYCLE_MS);
      };
      const stop = () => {
        clearInterval(timer);
        timer = null;
        wrap.classList.remove("is-cycling");
      };

      names.forEach((n, i) => {
        n.addEventListener("mouseenter", () => select(i));
        n.addEventListener("focus", () => select(i));
        n.addEventListener("click", () => select(i));
      });
      wrap.addEventListener("mouseenter", stop);
      wrap.addEventListener("focusin", stop);
      wrap.addEventListener("mouseleave", start);
      start();
      this.cleanups.push(stop);
    }

    /* Variant: arches */

    render_arches() {
      const cards = this.members
        .map(
          (m, i) => `
          <li class="ft-arch" data-ft-reveal style="--ft-i:${i}" data-tone="${i % 3}" tabindex="0">
            <div class="ft-arch-shape">
              <div class="ft-arch-fill" aria-hidden="true"></div>
              ${this.imgHtml(m)}
              ${m.buttonLink ? `<div class="ft-arch-role">${this.buttonHtml(m)}</div>` : ""}
            </div>
            <h3 class="ft-name">${escapeHtml(m.name)}</h3>
            <p class="ft-role">${escapeHtml(m.role)}</p>
          </li>`
        )
        .join("");
      return `${this.titleHtml()}<ul class="ft-arches">${cards}</ul>`;
    }

    /* Variant: index */

    render_index() {
      const rows = this.members
        .map(
          (m, i) => `
          <li class="ft-row" data-ft-reveal style="--ft-i:${i}" data-index="${i}" tabindex="0">
            <span class="ft-row-sweep" aria-hidden="true"></span>
            <span class="ft-row-num">${String(i + 1).padStart(2, "0")}</span>
            ${this.imgHtml(m, "ft-row-thumb")}
            <span class="ft-name">${escapeHtml(m.name)}</span>
            <span class="ft-role">${escapeHtml(m.role)}</span>
            ${this.buttonHtml(m)}
          </li>`
        )
        .join("");
      const follower = this.members.map((m, i) => this.imgHtml(m, "ft-follow-img", `data-index="${i}" alt=""`)).join("");
      return `
        ${this.titleHtml()}
        <ol class="ft-index">${rows}</ol>
        <div class="ft-follow" aria-hidden="true">${follower}</div>`;
    }

    bind_index() {
      const list = this.root.querySelector(".ft-index");
      const follow = this.root.querySelector(".ft-follow");
      const imgs = [...follow.querySelectorAll(".ft-follow-img")];
      const canHover = window.matchMedia("(hover: hover)").matches;
      if (!canHover) return;

      let target = { x: 0, y: 0 };
      let pos = { x: 0, y: 0 };
      let raf = null;
      const ease = REDUCED_MOTION ? 1 : 0.14;

      const tick = () => {
        pos.x += (target.x - pos.x) * ease;
        pos.y += (target.y - pos.y) * ease;
        const tilt = Math.max(-8, Math.min(8, (target.x - pos.x) * 0.08));
        follow.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${tilt}deg)`;
        raf = requestAnimationFrame(tick);
      };
      const show = i => {
        imgs.forEach((img, j) => img.classList.toggle("is-active", j === i));
        follow.classList.add("is-visible");
      };

      list.querySelectorAll(".ft-row").forEach(row => {
        const i = Number(row.dataset.index);
        row.addEventListener("mouseenter", () => show(i));
        row.addEventListener("focus", () => {
          const r = row.getBoundingClientRect();
          const o = this.root.getBoundingClientRect();
          target = { x: r.left - o.left + r.width * 0.62, y: r.top - o.top + r.height / 2 };
          pos = { ...target };
          show(i);
        });
        row.addEventListener("blur", () => follow.classList.remove("is-visible"));
      });
      const local = e => {
        const o = this.root.getBoundingClientRect();
        return { x: e.clientX - o.left, y: e.clientY - o.top };
      };
      const onMove = e => {
        target = local(e);
      };
      const onLeave = () => follow.classList.remove("is-visible");
      list.addEventListener("mousemove", onMove);
      list.addEventListener("mouseleave", onLeave);
      list.addEventListener(
        "mouseenter",
        e => {
          pos = local(e);
        },
        { once: true }
      );
      raf = requestAnimationFrame(tick);
      this.cleanups.push(() => cancelAnimationFrame(raf));
    }
  }

  /* Prototype-only switcher bar */

  function mountSwitcher(instances) {
    if (!IS_PROTOTYPE || !instances.length || document.querySelector(".ft-switcher")) return;
    const keys = Object.keys(VARIANTS);
    const bar = document.createElement("div");
    bar.className = "ft-switcher";
    bar.innerHTML = `
      <button type="button" data-step="-1" aria-label="Previous variant">←</button>
      <span class="ft-switcher-label"></span>
      <button type="button" data-step="1" aria-label="Next variant">→</button>`;
    document.body.appendChild(bar);
    const label = bar.querySelector(".ft-switcher-label");

    const go = step => {
      const current = instances[0].variant;
      const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
      const url = new URL(location.href);
      url.searchParams.set("team-variant", next);
      history.replaceState(null, "", url);
      instances.forEach(inst => inst.switchTo(next));
      render();
    };
    const render = () => {
      const v = instances[0].variant;
      label.textContent = `${keys.indexOf(v) + 1}/${keys.length} — ${VARIANTS[v]}`;
    };
    bar.addEventListener("click", e => {
      const step = Number(e.target.closest("button")?.dataset.step);
      if (step) go(step);
    });
    document.addEventListener("keydown", e => {
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });
    render();
  }

  function init() {
    const instances = [];
    document
      .querySelectorAll(`[data-wm-plugin="${PLUGIN}"]:not([data-loading-state])`)
      .forEach(el => {
        el.dataset.loadingState = "loading";
        try {
          el[NAMESPACE] = new FancyTeam(el);
          el.dataset.loadingState = "loaded";
          instances.push(el[NAMESPACE]);
        } catch (error) {
          el.dataset.loadingState = "error";
          console.error(`[${PLUGIN}] failed to initialize`, error);
        }
      });
    mountSwitcher(instances);
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
      document.querySelector(".ft-switcher")?.remove();
      observer.disconnect();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
