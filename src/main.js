import { createApp } from './client/app.js';
import { createApi } from './client/api.js';

const status = document.querySelector('#boot-status');
let engine;
try {
  engine = createApp(document.querySelector('#scene'));
  const api = createApi();
  const { state } = await api.session();
  status.textContent = `Company connected at ${state.locationId}. Trading interface awaiting integration.`;
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
}
if (import.meta.hot) import.meta.hot.dispose(() => engine?.destroy());
