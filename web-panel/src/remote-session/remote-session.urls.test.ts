import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    readInitialWebSocketUrl,
    readSessionToken,
    TOKEN_STORAGE_KEY,
    WS_QUERY_PARAM,
} from './remote-session.urls';

describe('remote-session.urls', () => {
    beforeEach(() => {
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    afterEach(() => {
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    it('returns default fallback URL when no explicit query is provided', () => {
        const url = readInitialWebSocketUrl();
        expect(url).toContain('3223');
        expect(url).toContain('/remote/ws');
    });

    it('respects explicit ws query parameter over defaults', () => {
        window.history.replaceState({}, '', `/?${WS_QUERY_PARAM}=ws://192.168.1.100:9999/custom`);
        expect(readInitialWebSocketUrl()).toBe('ws://192.168.1.100:9999/custom');
    });

    it('extracts token from url and persists it in sessionStorage', () => {
        window.history.replaceState({}, '', '/?token=secret123');
        const token = readSessionToken();
        expect(token).toBe('secret123');
        expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('secret123');

        const wsUrl = readInitialWebSocketUrl();
        expect(wsUrl).toContain('token=secret123');
    });

    it('reads token from sessionStorage if absent in url', () => {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, 'stored_token_abc');
        window.history.replaceState({}, '', '/');

        expect(readSessionToken()).toBe('stored_token_abc');
        const wsUrl = readInitialWebSocketUrl();
        expect(wsUrl).toContain('token=stored_token_abc');
    });

    it('appends token to explicit ws parameter if token exists and not already present in parameter', () => {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, 'my-auth-token');
        window.history.replaceState({}, '', `/?${WS_QUERY_PARAM}=ws://192.168.1.5:3223/remote/ws`);

        const wsUrl = readInitialWebSocketUrl();
        expect(wsUrl).toBe('ws://192.168.1.5:3223/remote/ws?token=my-auth-token');
    });
});

