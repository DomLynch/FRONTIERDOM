import { Application, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';

/** Lead owns the single Engine lifecycle; World owns the entities it attaches. */
export function createApp(canvas) {
  const app = new Application(canvas);
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => app.resizeCanvas();
  window.addEventListener('resize', resize);
  resize();
  app.start();
  return {
    app,
    destroy() {
      window.removeEventListener('resize', resize);
      app.destroy();
    }
  };
}
