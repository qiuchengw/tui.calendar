import { useReducer } from 'preact/hooks';

import type { EventObject, EventState } from '@t/events';

export enum FormStateActionType {
  setCalendarId = 'setCalendarId',
  setPrivate = 'setPrivate',
  setAllday = 'setAllday',
  setState = 'setState',
}

type FormStateAction =
  | { type: FormStateActionType.setCalendarId; calendarId: string }
  | { type: FormStateActionType.setPrivate; isPrivate: boolean }
  | { type: FormStateActionType.setAllday; isAllday: boolean }
  | { type: FormStateActionType.setState; state: EventState };

export type FormStateDispatcher = (action: FormStateAction) => void;

function formStateReducer(state: EventObject, action: FormStateAction): EventObject {
  switch (action.type) {
    case FormStateActionType.setCalendarId:
      return { ...state, calendarId: action.calendarId };
    case FormStateActionType.setPrivate:
      return { ...state, isPrivate: action.isPrivate };
    case FormStateActionType.setAllday:
      return { ...state, isAllday: action.isAllday };
    case FormStateActionType.setState:
      return { ...state, state: action.state };

    default:
      return state;
  }
}

export function useFormState(initialState: EventObject) {
  return useReducer(formStateReducer, initialState);
}
