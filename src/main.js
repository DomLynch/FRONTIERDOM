import { createApp } from './client/app.js';
import { createApi } from './client/api.js';
import { createWorld } from './world/index.js';
import { mountUI } from './ui/index.js';

const container = document.querySelector('#ui');
let engine, world, ui;
try {
  engine = createApp(document.querySelector('#scene'));
  world = createWorld(engine.app);
  ui = mountUI(container, { api: createApi(), onState: state => world.setState(state) });
} catch (error) {
  // DOM error copy is text-only; server or browser messages never become markup.
  container.replaceChildren();
  const status = document.createElement('p');
  status.setAttribute('role', 'alert');
  status.textContent = `Unable to start FRONTIERDOM: ${error.message}`;
  container.append(status);
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  ui?.destroy();
  world?.destroy();
  engine?.destroy();
});
