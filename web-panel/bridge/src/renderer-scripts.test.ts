import { describe, expect, it } from 'vitest';

import {
  findSteamAppId,
  getSteamClientIconUrl,
  normalizeImageUrl,
} from '../scripts/default/installed-apps-sync/artwork.js';
import { resolveQrRenderer } from '../scripts/default/remote-popup-cleanup/qr-renderer.js';

describe('installed-apps renderer script models', () => {
  it('normalizes captured artwork shapes without a Wand runtime', () => {
    expect(normalizeImageUrl({ cover: { imageUrl: '//cdn.example/game.webp' } }))
      .toBe('https://cdn.example/game.webp');
    expect(normalizeImageUrl('file:///local/image.png')).toBeNull();
  });

  it('finds nested Steam metadata and builds the Wand client icon URL', () => {
    const fixture = {
      game: {
        metadata: {
          steam: {
            appId: 1245620,
          },
        },
      },
    };

    expect(findSteamAppId(fixture)).toBe('1245620');
    expect(getSteamClientIconUrl(findSteamAppId(fixture)))
      .toBe('https://api-cdn.wemod.com/steam_community/1245620/client_icon/96.webp');
  });

  it('resolves the tree-shaken Wand QR renderer without a create export', () => {
    const renderer = () => undefined;
    const webpackRequire = {
      c: {
        qrCode: { exports: { mo: renderer } },
      },
    };

    expect(resolveQrRenderer(webpackRequire)).toBe(renderer);
  });
});
