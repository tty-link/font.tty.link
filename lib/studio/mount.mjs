import "./mount.js";

const classic = globalThis.FontKkuStudio;

export function mount(container, options = {}) {
  return classic.mount(container, { studioUrl: new URL("./index.html", import.meta.url).href, ...options });
}

export default { mount };
