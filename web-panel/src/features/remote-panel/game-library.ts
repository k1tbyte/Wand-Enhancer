import { formatHumanLabel } from '@/lib/utils';
import type { GameStatusPayload, InstalledAppSummary, TrainerSummary } from './protocol';

export type LibraryGame = {
    id: string;
    title: string;
    platform: string;
    hours: number | null;
    path: string;
    imageUrl: string | null;
    app: InstalledAppSummary;
    gameId: string | null;
    titleId: string | null;
    pinned: boolean;
    running: boolean;
};

export type LibrarySections = {
    running: LibraryGame | null;
    pinned: LibraryGame[];
    rest: LibraryGame[];
};

export function buildLibraryGames(
    apps: InstalledAppSummary[],
    status: GameStatusPayload | null,
    trainer: TrainerSummary | null,
    pinnedGameIds: Record<string, true>,
): LibraryGame[] {
    const activeGameId = status?.session.gameId ?? status?.trainer.gameId ?? trainer?.gameId ?? null;
    const activeTitleId = status?.session.titleId ?? status?.trainer.titleId ?? trainer?.titleId ?? null;

    return apps.map((app) => {
        const id = getInstalledAppId(app);
        return {
            id,
            title: app.displayName,
            platform: formatHumanLabel(app.platform),
            hours: minutesToHours(app.platformTotalPlaytimeMinutes),
            path: app.location,
            imageUrl: app.imageUrl ?? null,
            app,
            gameId: app.gameId ?? null,
            titleId: app.titleId ?? null,
            pinned: Boolean(pinnedGameIds[id]),
            running: isActiveInstalledApp(app, activeGameId, activeTitleId),
        };
    }).sort(compareLibraryGames);
}

export function getCurrentGame(games: LibraryGame[]): LibraryGame | null {
    return games.find((game) => game.running) ?? null;
}

export function getLibrarySections(games: LibraryGame[]): LibrarySections {
    const running = getCurrentGame(games);
    return {
        running,
        pinned: games.filter((game) => game.pinned && game.id !== running?.id),
        rest: games.filter((game) => !game.pinned && game.id !== running?.id),
    };
}

export function filterLibraryGames(games: LibraryGame[], query: string): LibraryGame[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return games;
    }

    return games.filter((game) => {
        if (game.title.toLowerCase().includes(normalized)) return true;
        if (game.id.toLowerCase().includes(normalized)) return true;
        if (game.platform.toLowerCase().includes(normalized)) return true;
        if (game.path.toLowerCase().includes(normalized)) return true;
        return false;
    });
}

export function formatHours(hours: number | null): string | null {
    if (hours === null) {
        return null;
    }

    if (hours < 10) {
        return `${hours.toFixed(1)}h`;
    }

    return `${Math.round(hours)}h`;
}

export function shortPath(path: string): string {
    if (!path.trim()) {
        return '';
    }

    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length <= 2) {
        return path;
    }

    return `.../${parts.slice(-2).join('/')}`;
}

export function getGameCoverLabel(game: LibraryGame): string {
    return game.title.split(/[:\s]/).filter(Boolean)[0]?.slice(0, 8).toUpperCase() || 'GAME';
}

export function getInstalledAppId(app: InstalledAppSummary): string {
    return app.gameId?.trim() || app.titleId?.trim() || app.correlationId;
}

function minutesToHours(minutes: number | null | undefined): number | null {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
        return null;
    }

    return minutes / 60;
}

function compareLibraryGames(left: LibraryGame, right: LibraryGame): number {
    const runningDiff = Number(right.running) - Number(left.running);
    if (runningDiff !== 0) {
        return runningDiff;
    }

    const pinnedDiff = Number(right.pinned) - Number(left.pinned);
    if (pinnedDiff !== 0) {
        return pinnedDiff;
    }

    return left.title.localeCompare(right.title);
}

function isActiveInstalledApp(app: InstalledAppSummary, activeGameId: string | null, activeTitleId: string | null): boolean {
    if (activeGameId && app.gameId === activeGameId) {
        return true;
    }

    if (activeTitleId && app.titleId === activeTitleId) {
        return true;
    }

    return false;
}
