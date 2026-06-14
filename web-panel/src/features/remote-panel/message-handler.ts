import type { IncomingMessage, TrainerMetaPayload } from './protocol';
import { normalizeIncomingValue } from './protocol';
import type { PanelAction } from './state';

type Dispatch = (action: PanelAction) => void;

export async function handleProtocolMessage(dispatch: Dispatch, message: IncomingMessage, trainerMeta: TrainerMetaPayload | null): Promise<void> {
    switch (message.type) {
        case 'hello_ack':
            handleHelloAck(dispatch, message.payload.accepted, message.payload.remoteUrl);
            return;
        case 'trainer_meta':
            const payloadWithI18n = await fetchI18nForTrainerMeta(message.payload);
            dispatch({ type: 'trainerMeta', payload: payloadWithI18n });
            return;
        case 'game_status':
            dispatch({ type: 'gameStatus', payload: message.payload });
            return;
        case 'installed_apps':
            dispatch({ type: 'installedApps', payload: message.payload });
            return;
        case 'trainer_values':
            dispatch({ type: 'trainerValues', payload: message.payload.values });
            return;
        case 'value_changed':
            handleValueChanged(dispatch, message, trainerMeta);
            return;
        case 'trainer_changed':
            dispatch({ type: 'trainerChanged' });
            return;
        case 'set_value_result':
            if (!message.payload.ok) {
                dispatch({ type: 'error', message: message.payload.error?.message ?? 'The trainer rejected the requested value.' });
            }
            return;
        case 'remote_command_result':
            if (!message.payload.ok) {
                dispatch({ type: 'error', message: message.payload.error?.message ?? 'The remote game command was rejected.' });
            }
            return;
        case 'error':
            dispatch({ type: 'error', message: message.payload.message });
            return;
    }
}

function handleHelloAck(dispatch: Dispatch, accepted: boolean, remoteUrl?: string): void {
    if (!accepted) {
        dispatch({ type: 'error', message: 'The desktop bridge rejected the connection.' });
        return;
    }

    if (remoteUrl) {
        dispatch({ type: 'setRemoteUrl', remoteUrl });
    }
}

function handleValueChanged(dispatch: Dispatch, message: Extract<IncomingMessage, { type: 'value_changed' }>, trainerMeta: TrainerMetaPayload | null): void {
    const cheat = trainerMeta?.schema.cheats.find((item) => item.target === message.payload.target || item.uuid === message.payload.cheatId);
    const nextValue = cheat ? normalizeIncomingValue(cheat, message.payload.value) : message.payload.value;
    dispatch({ type: 'valueChanged', target: message.payload.target, value: nextValue });
}

async function fetchI18nForTrainerMeta(payload: TrainerMetaPayload): Promise<TrainerMetaPayload> {
    try {
        const accessToken = payload?.session?.accessToken;
        const gameId = payload?.trainer?.gameId;
        const gameVersion = payload?.trainer?.gameVersion;
        const language = payload?.trainer?.language;

        const params = new URLSearchParams();

        if (gameVersion) params.append('gameVersions', gameVersion);
        if (language) params.append('locale', language);

        const url = `https://api.wemod.com/v3/games/${gameId}/trainer?${params.toString()}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const trainer = await response.json();

        payload.schema.cheats.forEach((item) => {
            // name
            const name = item.name;
            if (name) {
                const i18nString = trainer?.i18n?.strings?.[name];
                if (i18nString) item.name = i18nString;
            }
            // description
            const description = item.description;
            if (description) {
                const i18nString = trainer?.i18n?.strings?.[description];
                if (i18nString) item.description = i18nString;
            }
            // instructions
            const instructions = item.instructions;
            if (instructions) {
                const i18nString = trainer?.i18n?.strings?.[instructions];
                if (i18nString) item.instructions = i18nString;
            }
        });

        return payload;
    } catch (e) {
        return payload;
    }
}
