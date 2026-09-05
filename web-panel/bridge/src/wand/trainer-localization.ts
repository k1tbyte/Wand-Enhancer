const https = require('node:https');

const WEMOD_TRAINER_ENDPOINT = 'https://api.wemod.com/v3/games';
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
let cachedRequestKey = '';
let cachedStrings: Record<string, string> | null = null;
let inFlightRequestKey = '';
let inFlightRequest: Promise<Record<string, string> | null> | null = null;

type FetchTrainerStringsRequest = {
    accessToken: string;
    gameId: string;
    gameVersion: string;
    language: string;
};

type MinimalResponse = {
    statusCode?: number;
    resume(): void;
    setEncoding(encoding: string): void;
    on(event: 'data', listener: (chunk: Buffer | string) => void): MinimalResponse;
    on(event: 'end', listener: () => void): MinimalResponse;
    on(event: 'error', listener: (error: unknown) => void): MinimalResponse;
};

type MinimalRequest = {
    destroy(): void;
    setTimeout(timeout: number, callback: () => void): MinimalRequest;
    on(event: 'error', listener: (error: unknown) => void): MinimalRequest;
};

export async function localizeTrainerSnapshot(
    rawSnapshot: unknown,
    accessToken: string | null,
    loadStrings = fetchTrainerStrings,
) {
    const request = buildTrainerRequest(rawSnapshot, accessToken);
    if (!request) {
        return rawSnapshot;
    }

    let strings: Record<string, string> | null = null;
    try {
        strings = await loadStrings(request);
    } catch {
        return rawSnapshot;
    }
    if (!strings) {
        return rawSnapshot;
    }

    const snap = rawSnapshot as Record<string, unknown>;
    const metadata = snap.metadata as Record<string, unknown> | undefined;
    const info = metadata?.info as Record<string, unknown> | undefined;
    const blueprint = info?.blueprint as Record<string, unknown> | undefined;
    if (!Array.isArray(blueprint?.cheats)) {
        return rawSnapshot;
    }

    return {
        ...snap,
        metadata: {
            ...metadata,
            info: {
                ...info,
                blueprint: {
                    ...blueprint,
                    cheats: blueprint.cheats.map((cheat: unknown) =>
                        localizeCheat(cheat, strings as Record<string, string>),
                    ),
                },
            },
        },
    };
}

function buildTrainerRequest(
    rawSnapshot: unknown,
    accessToken: string | null,
): FetchTrainerStringsRequest | null {
    if (!accessToken || !rawSnapshot || typeof rawSnapshot !== 'object') {
        return null;
    }

    const snap = rawSnapshot as Record<string, unknown>;
    const trainerInfo = snap.trainerInfo as Record<string, unknown> | undefined;
    const metadata = snap.metadata as Record<string, unknown> | undefined;
    const info = metadata?.info as Record<string, unknown> | undefined;

    const gameId = stringValue(trainerInfo?.gameId || info?.gameId);
    if (!gameId) {
        return null;
    }

    return {
        accessToken,
        gameId,
        gameVersion: stringValue(snap.gameVersion),
        language: stringValue(snap.language),
    };
}

function fetchTrainerStrings({
    accessToken,
    gameId,
    gameVersion,
    language,
}: FetchTrainerStringsRequest) {
    const requestKey = [accessToken, gameId, gameVersion, language].join('\0');
    if (requestKey === cachedRequestKey) {
        return Promise.resolve(cachedStrings);
    }
    if (requestKey === inFlightRequestKey && inFlightRequest) {
        return inFlightRequest;
    }

    const url = new URL(`${WEMOD_TRAINER_ENDPOINT}/${encodeURIComponent(gameId)}/trainer`);
    if (gameVersion) url.searchParams.set('gameVersions', gameVersion);
    if (language) url.searchParams.set('locale', language);

    const request = requestJson(url, accessToken)
        .then((payload: unknown) =>
            normalizeStrings((payload as { i18n?: { strings?: unknown } })?.i18n?.strings),
        )
        .then((strings) => {
            if (strings) {
                cachedRequestKey = requestKey;
                cachedStrings = strings;
            }
            return strings;
        })
        .finally(() => {
            if (inFlightRequestKey === requestKey) {
                inFlightRequestKey = '';
                inFlightRequest = null;
            }
        });

    inFlightRequestKey = requestKey;
    inFlightRequest = request;
    return request;
}

function requestJson(url: URL, accessToken: string): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
        let settled = false;
        const finish = (value: unknown) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const request = https.get(
            url,
            {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            (response: MinimalResponse) => {
                if (response.statusCode !== 200) {
                    response.resume();
                    finish(null);
                    return;
                }

                let body = '';
                let receivedBytes = 0;
                response.setEncoding('utf8');
                response.on('data', (chunk: Buffer | string) => {
                    receivedBytes += Buffer.byteLength(chunk);
                    if (receivedBytes > RESPONSE_LIMIT_BYTES) {
                        request.destroy();
                        finish(null);
                        return;
                    }
                    body += chunk;
                });
                response.on('end', () => {
                    try {
                        finish(JSON.parse(body));
                    } catch {
                        finish(null);
                    }
                });
                response.on('error', () => {
                    finish(null);
                });
            },
        ) as MinimalRequest;

        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy());
        request.on('error', () => finish(null));
    });
}

function normalizeStrings(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const strings = Object.fromEntries(
        Object.entries(value).filter((entry) => typeof entry[1] === 'string'),
    ) as Record<string, string>;
    return Object.keys(strings).length > 0 ? strings : null;
}

function localizeCheat(cheat: unknown, strings: Record<string, string>) {
    if (!cheat || typeof cheat !== 'object') {
        return cheat;
    }

    const c = cheat as Record<string, unknown>;
    return {
        ...c,
        name: translate(c.name, strings),
        description: translate(c.description, strings),
        instructions: translate(c.instructions, strings),
    };
}

function translate(value: unknown, strings: Record<string, string>) {
    return typeof value === 'string' ? (strings[value] ?? value) : value;
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value ? value : '';
}
