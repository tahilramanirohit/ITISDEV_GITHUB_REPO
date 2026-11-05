// jsdom lacks ResizeObserver, which Recharts' ResponsiveContainer needs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom does not implement scrolling; wizard steps scroll to the top.
window.scrollTo = () => {};
// Buddy suggestions scroll to a player's card; jsdom has no layout to scroll.
HTMLElement.prototype.scrollIntoView = () => {};
