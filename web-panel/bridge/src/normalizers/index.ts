const { KNOWN_CHEAT_TYPES } = require('../constants');
const { cloneValue, firstString, isRecord, safeString, toStringId } = require('../utils');
const { normalizeRemoteCommandAction, normalizeRemoteCommandResult } = require('./command-results');
const { gameStatusSignature, normalizeGameStatusSnapshot } = require('./game-status');
const { normalizeTrainerValue } = require('./trainer');

function normalizeOption(option) {
    if (typeof option === 'string' || typeof option === 'number') {
        return {
            label: String(option),
            value: option,
        };
    }

    if (!isRecord(option)) {
        return null;
    }

    const value = option.value;
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    return {
        label: safeString(option.label, String(value)),
        value,
    };
}

function normalizeArgs(args) {
    if (!isRecord(args)) {
        return {};
    }

    const next: Record<string, unknown> = {};
    if (typeof args.min === 'number') next.min = args.min;
    if (typeof args.max === 'number') next.max = args.max;
    if (typeof args.step === 'number') next.step = args.step;
    if (typeof args.postfix === 'string') next.postfix = args.postfix;
    if (typeof args.default === 'string' || typeof args.default === 'number' || typeof args.default === 'boolean') {
        next.default = args.default;
    }

    if (Array.isArray(args.options)) {
        next.options = args.options.map(normalizeOption).filter(Boolean);
    }

    if (typeof args.button === 'string' || typeof args.button === 'boolean') {
        next.button = args.button;
    }

    return next;
}

function normalizeCheat(cheat, index) {
    if (!isRecord(cheat)) {
        return null;
    }

    const target = safeString(cheat.target);
    const type = safeString(cheat.type);
    if (!target || !KNOWN_CHEAT_TYPES.has(type)) {
        return null;
    }

    const normalized: Record<string, unknown> = {
        uuid: safeString(cheat.uuid, `${target}-${index}`),
        target,
        type,
        name: safeString(cheat.name, target),
        description: typeof cheat.description === 'string' ? cheat.description : null,
        instructions: typeof cheat.instructions === 'string' ? cheat.instructions : null,
        category: safeString(cheat.category, 'general'),
        parent: typeof cheat.parent === 'string' ? cheat.parent : null,
        args: normalizeArgs(cheat.args),
    };

    if (typeof cheat.flags === 'number') {
        normalized.flags = cheat.flags;
    }

    if (Array.isArray(cheat.hotkeys)) {
        normalized.hotkeys = cheat.hotkeys.filter(Array.isArray).map((group) => group.map((item) => String(item)));
    }

    return normalized;
}

function normalizeImageUrl(...values) {
    const value = firstString(...values);
    if (!value) {
        return null;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function getRawInstalledApps(rawSnapshot) {
    if (Array.isArray(rawSnapshot)) {
        return rawSnapshot;
    }

    if (isRecord(rawSnapshot) && Array.isArray(rawSnapshot.apps)) {
        return rawSnapshot.apps;
    }

    if (isRecord(rawSnapshot) && Array.isArray(rawSnapshot.installedApps)) {
        return rawSnapshot.installedApps;
    }

    return null;
}

function normalizeInstalledApp(app) {
    if (!isRecord(app)) {
        return null;
    }

    const platform = safeString(app.platform);
    const sku = safeString(app.sku);
    if (!platform || !sku) {
        return null;
    }

    const location = typeof app.location === 'string' ? app.location : '';
    return {
        platform,
        sku,
        correlationId: `${platform}:${sku}`,
        displayName: firstString(
            app.displayName,
            app.titleName,
            app.gameName,
            app.name,
            location.replaceAll('\\', '/').split('/').filter(Boolean).pop() || '',
            `${platform}:${sku}`
        ),
        gameId: toStringId(app.gameId),
        titleId: toStringId(app.titleId),
        imageUrl: normalizeImageUrl(app.imageUrl, app.iconUrl, app.coverUrl, app.thumbnailUrl, app.logoUrl, app.headerImageUrl),
        platformLastPlayedTimestamp: typeof app.platformLastPlayedTimestamp === 'number' ? app.platformLastPlayedTimestamp : null,
        platformTotalPlaytimeMinutes: typeof app.platformTotalPlaytimeMinutes === 'number' ? app.platformTotalPlaytimeMinutes : null,
    };
}

function normalizeInstalledAppsSnapshot(rawSnapshot) {
    const rawApps = getRawInstalledApps(rawSnapshot);
    if (!rawApps) {
        return null;
    }

    const apps = rawApps.map(normalizeInstalledApp).filter(Boolean).sort(compareInstalledApps);
    return {
        instanceId: isRecord(rawSnapshot) ? safeString(rawSnapshot.instanceId, 'wand-installed-apps') : 'wand-installed-apps',
        updatedAt: isRecord(rawSnapshot) && typeof rawSnapshot.updatedAt === 'string' ? rawSnapshot.updatedAt : new Date().toISOString(),
        apps,
    };
}

function summarizeInstalledAppsSource(rawSnapshot) {
    if (!isRecord(rawSnapshot) || !isRecord(rawSnapshot.diagnostics)) {
        return '';
    }

    const parts: string[] = [];
    for (const key of ['rawInstalledApps', 'catalogGames', 'catalogTitles']) {
        const value = rawSnapshot.diagnostics[key];
        if (typeof value === 'number') {
            parts.push(`${key}=${value}`);
        }
    }

    return parts.join(', ');
}

function installedAppsSignature(snapshot) {
    return snapshot.apps
        .map((app) => [
            app.platform,
            app.sku,
            app.displayName,
            app.gameId || '',
            app.titleId || '',
            app.imageUrl || '',
            app.platformLastPlayedTimestamp || '',
            app.platformTotalPlaytimeMinutes || '',
        ].join('|'))
        .join('\n');
}

function normalizeSnapshot(rawSnapshot) {
    if (!isRecord(rawSnapshot) || !isRecord(rawSnapshot.metadata) || !isRecord(rawSnapshot.metadata.info)) {
        return null;
    }

    const info = rawSnapshot.metadata.info;
    const blueprint = isRecord(info.blueprint) ? info.blueprint : {};
    const rawCheats = Array.isArray(blueprint.cheats) ? blueprint.cheats : [];
    const cheats = rawCheats.map(normalizeCheat).filter(Boolean);
    const categories = Array.from(new Set(cheats.map((entry) => entry.category)));
    const trainerId = safeString(rawSnapshot.trainerId || rawSnapshot.trainerInfo?.trainerId);
    const displayName = firstString(
        rawSnapshot.trainerInfo?.displayName,
        rawSnapshot.trainerInfo?.gameName,
        rawSnapshot.trainerInfo?.titleName,
        rawSnapshot.trainerInfo?.title,
        rawSnapshot.trainerInfo?.name,
        info.displayName,
        info.gameName,
        info.titleName,
        info.title,
        info.name,
        info.game?.displayName,
        info.game?.name,
        info.game?.title
    );

    if (!trainerId) {
        return null;
    }

    const trainerMeta = {
        session: {
            instanceId: safeString(rawSnapshot.instanceId, 'wand-session'),
        },
        trainer: {
            trainerId,
            gameId: safeString(rawSnapshot.trainerInfo?.gameId || info.gameId),
            displayName: displayName || safeString(rawSnapshot.trainerInfo?.gameId || info.gameId, trainerId),
            titleId: typeof info.titleId === 'string' ? info.titleId : null,
            gameVersion: typeof rawSnapshot.gameVersion === 'string' ? rawSnapshot.gameVersion : null,
            trainerLoading: rawSnapshot.trainerLoading === true,
            gameInstalled: rawSnapshot.gameInstalled !== false,
            needsCompatibilityWarning: rawSnapshot.needsCompatibilityWarning === true,
            language: safeString(rawSnapshot.language, 'en-US'),
            themeId: safeString(rawSnapshot.themeId, 'default'),
            isTimeLimitExpired: rawSnapshot.isTimeLimitExpired === true,
            notesReadHash: typeof rawSnapshot.notesReadHash === 'string' ? rawSnapshot.notesReadHash : null,
        },
        schema: {
            categories,
            cheats,
        },
    };

    const trainerValues = {
        trainerId,
        values: isRecord(rawSnapshot.values) ? cloneValue(rawSnapshot.values) : {},
    };
    for (const cheat of cheats) {
        if (cheat.target in trainerValues.values) {
            trainerValues.values[cheat.target] = normalizeTrainerValue({ trainerMeta }, cheat.target, trainerValues.values[cheat.target]);
        }
    }

    return {
        trainerMeta,
        trainerValues,
    };
}

function compareInstalledApps(left, right) {
    const displayNameDiff = left.displayName.localeCompare(right.displayName);
    if (displayNameDiff !== 0) {
        return displayNameDiff;
    }

    const platformDiff = left.platform.localeCompare(right.platform);
    if (platformDiff !== 0) {
        return platformDiff;
    }

    return left.sku.localeCompare(right.sku);
}

module.exports = {
    gameStatusSignature,
    installedAppsSignature,
    normalizeGameStatusSnapshot,
    normalizeInstalledAppsSnapshot,
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
    normalizeSnapshot,
    normalizeTrainerValue,
    summarizeInstalledAppsSource,
};
