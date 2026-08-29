import type {
    CheatArgs,
    CheatOption,
    CheatSchema,
    InstalledAppSummary,
    InstalledAppsPayload,
    TrainerMetaPayload,
    TrainerValuesPayload,
} from '../../../protocol/messages';
import type { UnknownRecord } from '../types';

const { KNOWN_CHEAT_TYPES } = require('../constants');
const { cloneValue, firstString, isRecord, safeString, toStringId } = require('../utils');
const { normalizeRemoteCommandAction, normalizeRemoteCommandResult } = require('./command-results');
const { gameStatusSignature, normalizeGameStatusSnapshot } = require('./game-status');
const { normalizeTrainerValue } = require('./trainer');

function normalizeOption(option: unknown): CheatOption | null {
    if (typeof option === 'string' || typeof option === 'number') {
        return {
            label: String(option),
            value: option,
        };
    }

    if (!isRecord(option)) {
        return null;
    }

    const opt = option as UnknownRecord;
    const value = opt.value;
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    return {
        label: safeString(opt.label, String(value)),
        value,
    };
}

function normalizeArgs(args: unknown): CheatArgs {
    if (!isRecord(args)) {
        return {};
    }

    const a = args as UnknownRecord;
    const next: CheatArgs = {};
    if (typeof a.min === 'number') next.min = a.min;
    if (typeof a.max === 'number') next.max = a.max;
    if (typeof a.step === 'number') next.step = a.step;
    if (typeof a.postfix === 'string') next.postfix = a.postfix;
    if (
        typeof a.default === 'string' ||
        typeof a.default === 'number' ||
        typeof a.default === 'boolean'
    ) {
        next.default = a.default;
    }

    if (Array.isArray(a.options)) {
        next.options = a.options.map(normalizeOption).filter(Boolean) as CheatOption[];
    }

    if (typeof a.button === 'string' || typeof a.button === 'boolean') {
        next.button = a.button;
    }

    return next;
}

function normalizeCheat(cheat: unknown, index: number): CheatSchema | null {
    if (!isRecord(cheat)) {
        return null;
    }

    const c = cheat as UnknownRecord;
    const target = safeString(c.target);
    const type = safeString(c.type) as CheatSchema['type'];
    if (!target || !KNOWN_CHEAT_TYPES.has(type)) {
        return null;
    }

    const normalized: CheatSchema = {
        uuid: safeString(c.uuid, `${target}-${index}`),
        target,
        type,
        name: safeString(c.name, target),
        description: typeof c.description === 'string' ? c.description : null,
        instructions: typeof c.instructions === 'string' ? c.instructions : null,
        category: safeString(c.category, 'general'),
        parent: typeof c.parent === 'string' ? c.parent : null,
        args: normalizeArgs(c.args),
    };

    if (typeof c.flags === 'number') {
        normalized.flags = c.flags;
    }

    if (Array.isArray(c.hotkeys)) {
        normalized.hotkeys = c.hotkeys
            .filter(Array.isArray)
            .map((group: unknown[]) => group.map((item: unknown) => String(item)));
    }

    return normalized;
}

function normalizeImageUrl(...values: unknown[]): string | null {
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

function getRawInstalledApps(rawSnapshot: unknown): unknown[] | null {
    if (Array.isArray(rawSnapshot)) {
        return rawSnapshot;
    }

    if (isRecord(rawSnapshot)) {
        const snap = rawSnapshot as UnknownRecord;
        if (Array.isArray(snap.apps)) return snap.apps;
        if (Array.isArray(snap.installedApps)) return snap.installedApps;
    }

    return null;
}

function normalizeInstalledApp(app: unknown): InstalledAppSummary | null {
    if (!isRecord(app)) {
        return null;
    }
    const a = app as UnknownRecord;

    const platform = safeString(a.platform);
    const sku = safeString(a.sku);
    if (!platform || !sku) {
        return null;
    }

    const location = typeof a.location === 'string' ? a.location : '';
    return {
        platform,
        sku,
        correlationId: `${platform}:${sku}`,
        displayName: firstString(
            a.displayName,
            a.titleName,
            a.gameName,
            a.name,
            location.replaceAll('\\', '/').split('/').filter(Boolean).pop() || '',
            `${platform}:${sku}`,
        ),
        gameId: toStringId(a.gameId),
        titleId: toStringId(a.titleId),
        imageUrl: normalizeImageUrl(
            a.imageUrl,
            a.iconUrl,
            a.coverUrl,
            a.thumbnailUrl,
            a.logoUrl,
            a.headerImageUrl,
        ),
        platformLastPlayedTimestamp:
            typeof a.platformLastPlayedTimestamp === 'number'
                ? a.platformLastPlayedTimestamp
                : null,
        platformTotalPlaytimeMinutes:
            typeof a.platformTotalPlaytimeMinutes === 'number'
                ? a.platformTotalPlaytimeMinutes
                : null,
    };
}

function normalizeInstalledAppsSnapshot(rawSnapshot: unknown): InstalledAppsPayload | null {
    const rawApps = getRawInstalledApps(rawSnapshot);
    if (!rawApps) {
        return null;
    }

    const apps = rawApps.map(normalizeInstalledApp).filter(Boolean) as InstalledAppSummary[];
    apps.sort(compareInstalledApps);
    const snap = isRecord(rawSnapshot) ? (rawSnapshot as UnknownRecord) : null;
    return {
        instanceId: snap
            ? safeString(snap.instanceId, 'wand-installed-apps')
            : 'wand-installed-apps',
        updatedAt:
            snap && typeof snap.updatedAt === 'string' ? snap.updatedAt : new Date().toISOString(),
        apps,
    };
}

function summarizeInstalledAppsSource(rawSnapshot: unknown): string {
    if (!isRecord(rawSnapshot)) return '';
    const snap = rawSnapshot as UnknownRecord;
    if (!isRecord(snap.diagnostics)) return '';
    const diag = snap.diagnostics as UnknownRecord;

    const parts: string[] = [];
    for (const key of ['rawInstalledApps', 'catalogGames', 'catalogTitles']) {
        const value = diag[key];
        if (typeof value === 'number') {
            parts.push(`${key}=${value}`);
        }
    }

    return parts.join(', ');
}

/**
 * Structural, not field-by-field: an explicit field list silently stops detecting
 * whatever it forgets. The apps are already normalized here, so key order is stable.
 */
function installedAppsSignature(snapshot: InstalledAppsPayload): string {
    return JSON.stringify(snapshot.apps);
}

function normalizeSnapshot(
    rawSnapshot: unknown,
): { trainerMeta: TrainerMetaPayload; trainerValues: TrainerValuesPayload } | null {
    if (!isRecord(rawSnapshot)) return null;
    const snap = rawSnapshot as UnknownRecord;
    if (!isRecord(snap.metadata)) return null;
    const meta = snap.metadata as UnknownRecord;
    if (!isRecord(meta.info)) return null;
    const info = meta.info as UnknownRecord;

    const blueprint = isRecord(info.blueprint) ? (info.blueprint as UnknownRecord) : {};
    const rawCheats = Array.isArray(blueprint.cheats) ? blueprint.cheats : [];
    const cheats = rawCheats.map(normalizeCheat).filter(Boolean) as CheatSchema[];
    const categories = Array.from(new Set(cheats.map((entry) => entry.category)));

    const trainerInfo = isRecord(snap.trainerInfo) ? (snap.trainerInfo as UnknownRecord) : null;
    const infoGame = isRecord(info.game) ? (info.game as UnknownRecord) : null;

    const trainerId = safeString(snap.trainerId || trainerInfo?.trainerId);
    const displayName = firstString(
        trainerInfo?.displayName,
        trainerInfo?.gameName,
        trainerInfo?.titleName,
        trainerInfo?.title,
        trainerInfo?.name,
        info.displayName,
        info.gameName,
        info.titleName,
        info.title,
        info.name,
        infoGame?.displayName,
        infoGame?.name,
        infoGame?.title,
    );

    if (!trainerId) {
        return null;
    }

    const trainerMeta: TrainerMetaPayload = {
        session: {
            instanceId: safeString(snap.instanceId, 'wand-session'),
        },
        trainer: {
            trainerId,
            gameId: safeString(trainerInfo?.gameId || info.gameId),
            displayName: displayName || safeString(trainerInfo?.gameId || info.gameId, trainerId),
            titleId: typeof info.titleId === 'string' ? info.titleId : null,
            gameVersion: typeof snap.gameVersion === 'string' ? snap.gameVersion : null,
            trainerLoading: snap.trainerLoading === true,
            gameInstalled: snap.gameInstalled !== false,
            needsCompatibilityWarning: snap.needsCompatibilityWarning === true,
            language: safeString(snap.language, 'en-US'),
            themeId: safeString(snap.themeId, 'default'),
            isTimeLimitExpired: snap.isTimeLimitExpired === true,
            notesReadHash: typeof snap.notesReadHash === 'string' ? snap.notesReadHash : null,
        },
        schema: {
            categories,
            cheats,
        },
    };

    const trainerValues: TrainerValuesPayload = {
        trainerId,
        values: isRecord(snap.values) ? (cloneValue(snap.values) as Record<string, unknown>) : {},
    };
    for (const cheat of cheats) {
        if (cheat.target in trainerValues.values) {
            trainerValues.values[cheat.target] = normalizeTrainerValue(
                { trainerMeta },
                cheat.target,
                trainerValues.values[cheat.target],
            );
        }
    }

    return {
        trainerMeta,
        trainerValues,
    };
}

function compareInstalledApps(left: InstalledAppSummary, right: InstalledAppSummary): number {
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
