import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

let loadNumber = 0;

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.focused = false;
    this.selected = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  click() {
    if (!this.disabled) {
      for (const callback of this.listeners.get('click') ?? []) callback({ target: this });
    }
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

/** Faults model observable operations, not guarantees about native Web Storage. */
function makeStorage(entries) {
  const data = new Map(entries);
  const calls = [];
  const faults = {};
  const runHook = (name, operation) => faults[name]?.(operation, data);
  return {
    data, calls, faults,
    getItem(key) {
      const operation = { operation: 'get', key };
      calls.push(operation);
      runHook('beforeGet', operation);
      const value = data.get(key) ?? null;
      runHook('afterGet', { ...operation, value });
      return value;
    },
    setItem(key, value) {
      const operation = { operation: 'set', key, value: String(value) };
      calls.push(operation);
      runHook('beforeSet', operation);
      data.set(key, operation.value);
      runHook('afterSet', operation);
    },
    removeItem(key) {
      const operation = { operation: 'remove', key };
      calls.push(operation);
      runHook('beforeRemove', operation);
      data.delete(key);
      runHook('afterRemove', operation);
    }
  };
}

export const storageKey = id => `561-incremental-idle:${id}:v1`;

/**
 * Run the unchanged native browser module and dependencies. Only the browser
 * platform is adapted; no gameplay, persistence or recovery logic is duplicated.
 * The HTML comes from the real build so a required missing DOM node fails.
 * Tests in one process must use this helper serially because browser globals are
 * installed only for the duration of the callback and restored in finally.
 */
export async function withBrowser(entry, html, options, callback) {
  const elements = new Map();
  for (const [opening, tag, id] of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const element = new FakeElement(tag);
    // Preserve the real build's static attributes as well as runtime changes.
    // This intentionally supports its ordinary quoted/boolean HTML attributes,
    // not layout, native focus traversal or a complete browser DOM.
    for (const [, name, double, single, bare] of opening.slice(tag.length + 1, -1)
      .matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) {
      element.setAttribute(name, double ?? single ?? bare ?? '');
    }
    element.hidden = element.attributes.has('hidden');
    element.disabled = element.attributes.has('disabled');
    elements.set(id, element);
  }
  const storage = makeStorage(options.entries ?? []);
  Object.assign(storage.faults, options.faults ?? {});
  const intervals = [];
  const history = [];
  let now = options.now ?? 1_793_797_200_000;
  const names = ['document', 'location', 'localStorage', 'history', 'setInterval'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalNow = Date.now;
  const get = id => {
    assert.ok(elements.has(id), `build HTML supplies #${id}`);
    return elements.get(id);
  };
  const app = {
    get, storage, history,
    text: id => get(id).textContent,
    click: id => get(id).click(),
    tap: (count = 1) => { for (let i = 0; i < count; i++) get('tap').click(); },
    choose(label) {
      const button = get('worlds').children.find(node => node.textContent === label);
      assert.ok(button, `world selector contains ${label}`);
      button.click();
    },
    export() { get('export').click(); return get('save-data').value; },
    import(raw) { get('save-data').value = raw; get('import').click(); },
    saved(id = 'trace-garden') {
      const raw = storage.data.get(storageKey(id));
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    tick(milliseconds = 1000) {
      now += milliseconds;
      for (const { callback: run } of intervals) run();
    },
    now: () => now,
    assertExportedBank(expected) {
      const run = JSON.parse(this.export());
      assert.equal(run.banked, expected);
      return run;
    }
  };
  try {
    Object.assign(globalThis, {
      document: {
        getElementById: id => elements.get(id) ?? null,
        createElement: tag => new FakeElement(tag)
      },
      location: { search: options.search ?? '' },
      localStorage: storage,
      history: { replaceState: (_state, _title, url) => history.push(url) },
      setInterval: (run, milliseconds) => {
        intervals.push({ callback: run, milliseconds });
        return intervals.length;
      }
    });
    Date.now = () => now;
    await import(`${pathToFileURL(entry).href}?browserTest=${++loadNumber}`);
    return await callback(app);
  } finally {
    Date.now = originalNow;
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
