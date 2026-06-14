const { KNOWN_CHEAT_TYPES } = require('./constants.cjs');
const { cloneValue, firstString, isRecord, safeString, toStringId } = require('./utils.cjs');

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

    const next = {};
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

    const normalized = {
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
    return value || null;
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
    const alternateLocations = Array.isArray(app.alternateLocations)
        ? app.alternateLocations.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
        : [];

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
        location,
        alternateLocations,
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
    const diagnostics = isRecord(rawSnapshot) && isRecord(rawSnapshot.diagnostics)
        ? cloneValue(rawSnapshot.diagnostics)
        : null;

    return {
        instanceId: isRecord(rawSnapshot) ? safeString(rawSnapshot.instanceId, 'wand-installed-apps') : 'wand-installed-apps',
        updatedAt: isRecord(rawSnapshot) && typeof rawSnapshot.updatedAt === 'string' ? rawSnapshot.updatedAt : new Date().toISOString(),
        apps,
        diagnostics,
    };
}

function normalizeGameStatusSnapshot(rawSnapshot) {
    if (!isRecord(rawSnapshot)) {
        return null;
    }

    const rawSession = isRecord(rawSnapshot.session) ? rawSnapshot.session : {};
    const rawTrainer = isRecord(rawSnapshot.trainer) ? rawSnapshot.trainer : {};

    return {
        instanceId: safeString(rawSnapshot.instanceId, 'wand-game-status'),
        updatedAt: typeof rawSnapshot.updatedAt === 'string' ? rawSnapshot.updatedAt : new Date().toISOString(),
        session: {
            state: rawSession.state === 'running' ? 'running' : 'idle',
            event: safeString(rawSession.event, 'snapshot'),
            processId: typeof rawSession.processId === 'number' ? rawSession.processId : null,
            gameId: toStringId(rawSession.gameId),
            titleId: toStringId(rawSession.titleId),
            titleName: typeof rawSession.titleName === 'string' ? rawSession.titleName : null,
            sessionDurationSeconds: typeof rawSession.sessionDurationSeconds === 'number' ? rawSession.sessionDurationSeconds : null,
            startedAt: typeof rawSession.startedAt === 'string' ? rawSession.startedAt : null,
            endedAt: typeof rawSession.endedAt === 'string' ? rawSession.endedAt : null,
        },
        trainer: {
            state: rawTrainer.state === 'running' ? 'running' : 'idle',
            event: safeString(rawTrainer.event, 'snapshot'),
            trainerId: toStringId(rawTrainer.trainerId),
            displayName: typeof rawTrainer.displayName === 'string' ? rawTrainer.displayName : null,
            gameId: toStringId(rawTrainer.gameId),
            titleId: toStringId(rawTrainer.titleId),
        },
    };
}

function normalizeRemoteCommandAction(value) {
    if (value === 'launch' || value === 'stop') {
        return value;
    }

    return null;
}

function normalizeRemoteCommandResult(rawResult, fallback) {
    const action = normalizeRemoteCommandAction(isRecord(rawResult) ? rawResult.action : null) || fallback.action;
    const gameId = isRecord(rawResult) ? toStringId(rawResult.gameId) || fallback.gameId || null : fallback.gameId || null;
    const titleId = isRecord(rawResult) ? toStringId(rawResult.titleId) || fallback.titleId || null : fallback.titleId || null;
    const ok = rawResult === true || Boolean(isRecord(rawResult) && rawResult.ok === true);
    const payload = {
        ok,
        action,
        gameId,
        titleId,
    };

    if (ok) {
        return payload;
    }

    if (!isRecord(rawResult) || !isRecord(rawResult.error)) {
        return {
            ...payload,
            error: {
                code: 'command_rejected',
                message: 'The renderer rejected the remote command.',
            },
        };
    }

    return {
        ...payload,
        error: {
            code: safeString(rawResult.error.code, 'command_rejected'),
            message: safeString(rawResult.error.message, 'The renderer rejected the remote command.'),
        },
    };
}

function summarizeInstalledAppsSource(rawSnapshot) {
    if (!isRecord(rawSnapshot) || !isRecord(rawSnapshot.diagnostics)) {
        return '';
    }

    const parts = [];
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
            app.location,
            app.imageUrl || '',
            app.platformLastPlayedTimestamp || '',
            app.platformTotalPlaytimeMinutes || '',
        ].join('|'))
        .join('\n');
}

function gameStatusSignature(snapshot) {
    return [
        snapshot.session.state,
        snapshot.session.event,
        snapshot.session.processId || '',
        snapshot.session.gameId || '',
        snapshot.session.titleId || '',
        snapshot.session.titleName || '',
        snapshot.session.sessionDurationSeconds || '',
        snapshot.session.startedAt || '',
        snapshot.session.endedAt || '',
        snapshot.trainer.state,
        snapshot.trainer.event,
        snapshot.trainer.trainerId || '',
        snapshot.trainer.displayName || '',
        snapshot.trainer.gameId || '',
        snapshot.trainer.titleId || '',
    ].join('|');
}

function buildInstalledAppsDebugPayload(snapshot) {
    if (!snapshot) {
        return {
            ok: false,
            instanceId: null,
            updatedAt: null,
            counts: {
                myGamesEntries: 0,
                rawInstallEntries: 0,
                groupedTitles: 0,
                uniqueTitleIds: 0,
                uniqueGameIds: 0,
            },
            diagnostics: null,
            byPlatform: {},
            titles: [],
            apps: [],
        };
    }

    const diagnostics = isRecord(snapshot.diagnostics) ? snapshot.diagnostics : null;
    const byPlatform = {};
    const uniqueTitleIds = new Set();
    const uniqueGameIds = new Set();
    const titleGroups = new Map();

    for (const app of snapshot.apps) {
        byPlatform[app.platform] = (byPlatform[app.platform] || 0) + 1;

        if (app.titleId) {
            uniqueTitleIds.add(app.titleId);
        }

        if (app.gameId) {
            uniqueGameIds.add(app.gameId);
        }

        const groupKey = resolveInstalledAppGroupKey(app);
        let group = titleGroups.get(groupKey);
        if (!group) {
            group = {
                key: groupKey,
                titleId: app.titleId,
                displayName: app.displayName,
                gameIds: new Set(),
                platforms: new Set(),
                apps: [],
            };
            titleGroups.set(groupKey, group);
        }

        if (app.gameId) {
            group.gameIds.add(app.gameId);
        }

        group.platforms.add(app.platform);
        group.apps.push(app);
    }

    const titles = Array.from(titleGroups.values())
        .map((group) => ({
            key: group.key,
            titleId: group.titleId,
            displayName: group.displayName,
            gameIds: Array.from(group.gameIds).sort(),
            platforms: Array.from(group.platforms).sort(),
            appEntries: group.apps.length,
            apps: group.apps,
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));

    return {
        ok: true,
        instanceId: snapshot.instanceId,
        updatedAt: snapshot.updatedAt,
        counts: {
            myGamesEntries: snapshot.apps.length,
            rawInstallEntries: typeof diagnostics?.rawInstalledApps === 'number' ? diagnostics.rawInstalledApps : snapshot.apps.length,
            groupedTitles: titles.length,
            uniqueTitleIds: uniqueTitleIds.size,
            uniqueGameIds: uniqueGameIds.size,
        },
        diagnostics,
        byPlatform,
        titles,
        apps: snapshot.apps,
    };
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
            accessToken: safeString(rawSnapshot.accessToken),
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

function resolveInstalledAppGroupKey(app) {
    if (app.titleId) {
        return `title:${app.titleId}`;
    }

    if (app.gameId) {
        return `game:${app.gameId}`;
    }

    return `app:${app.correlationId}`;
}

module.exports = {
    buildInstalledAppsDebugPayload,
    gameStatusSignature,
    installedAppsSignature,
    normalizeGameStatusSnapshot,
    normalizeInstalledAppsSnapshot,
    normalizeRemoteCommandAction,
    normalizeRemoteCommandResult,
    normalizeSnapshot,
    summarizeInstalledAppsSource,
};
