import demoSession from '../../../fixtures/demo-session.json';
import type { TrainerMetaPayload, TrainerValuesPayload } from './protocol';

export const mockTrainerMeta = demoSession.trainerMeta as TrainerMetaPayload;
export const mockTrainerValues = demoSession.trainerValues as TrainerValuesPayload;
