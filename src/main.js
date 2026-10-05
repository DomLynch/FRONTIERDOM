import { createApp } from './client/app.js';
import { createApi } from './client/api.js';
import { createWorld } from './world/index.js';

const status = document.querySelector('#boot-status');
let engine;
let world;
try {
  engine = createApp(document.querySelector('#scene'));
  world = createWorld(engine.app);
  const api = createApi();
  const { state } = await api.session();
  world.setState(state);
  status.textContent = `Company connected at ${state.locationId}. Trading interface awaiting integration.`;
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  world?.destroy();
  engine?.destroy();
});
