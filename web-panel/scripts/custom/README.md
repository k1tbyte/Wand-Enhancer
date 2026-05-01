# Custom Renderer Scripts

Place user scripts here as plain `.js` files before running the Wand patch.

During patching, Wand Enhancer copies default scripts from `web-panel/scripts/default` and user scripts from this folder into `remote-panel/renderer-scripts` inside `app.asar`. Scripts are loaded in filename order on every Wand renderer startup.

Each script runs in the Wand renderer and receives a small global API:

```js
(function (WandEnhancer) {
  WandEnhancer.log('custom script loaded', WandEnhancer.remoteUrl);
})(globalThis.WandEnhancer);
```

Use unique global guards for repeat-safe scripts because the renderer can be reinjected after navigation.
