import { mockTrainerMeta, mockTrainerValues } from './mock-data';
import type { PanelAction } from './state';

const MOCK_QUERY_PARAM = 'mock';

type PanelDispatch = (action: PanelAction) => void;

export function isDebugSessionRequested(): boolean {
  return new URLSearchParams(window.location.search).get(MOCK_QUERY_PARAM) === '1';
}

export function loadDebugSession(dispatch: PanelDispatch): void {
  dispatch({ type: 'trainerMeta', payload: mockTrainerMeta });
  dispatch({ type: 'trainerValues', payload: mockTrainerValues.values });
}