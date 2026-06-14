import type { CheatSchema, TrainerMetaPayload } from '../../protocol/messages';

const WEMOD_TRAINER_ENDPOINT = 'https://api.wemod.com/v3/games';

type WemodTrainerResponse = {
  i18n?: { strings?: Record<string, string> };
};

export async function localizeTrainerMeta(payload: TrainerMetaPayload): Promise<TrainerMetaPayload> {
  const strings = await fetchTrainerStrings(payload);
  if (!strings) {
    return payload;
  }

  const cheats = payload.schema.cheats.map((cheat) => localizeCheat(cheat, strings));
  return { ...payload, schema: { ...payload.schema, cheats } };
}

async function fetchTrainerStrings(payload: TrainerMetaPayload): Promise<Record<string, string> | null> {
  const { accessToken } = payload.session;
  const { gameId, gameVersion, language } = payload.trainer;
  if (!accessToken || !gameId) {
    return null;
  }

  const params = new URLSearchParams();
  if (gameVersion) params.set('gameVersions', gameVersion);
  if (language) params.set('locale', language);

  try {
    const response = await fetch(`${WEMOD_TRAINER_ENDPOINT}/${gameId}/trainer?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return null;
    }

    const trainer = (await response.json()) as WemodTrainerResponse;
    return trainer.i18n?.strings ?? null;
  } catch {
    return null;
  }
}

function localizeCheat(cheat: CheatSchema, strings: Record<string, string>): CheatSchema {
  return {
    ...cheat,
    name: strings[cheat.name] ?? cheat.name,
    description: translate(cheat.description, strings),
    instructions: translate(cheat.instructions, strings),
  };
}

function translate(value: string | null | undefined, strings: Record<string, string>): string | null {
  if (!value) {
    return value ?? null;
  }

  return strings[value] ?? value;
}
