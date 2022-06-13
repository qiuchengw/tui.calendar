import type { EventObject, EventObjectWithDefaultValues } from '@t/events';

export type AnyFunc = (...args: any[]) => any;

export interface SelectDateTimeInfo {
  start: Date;
  end: Date;
  isAllday: boolean;
  nativeEvent?: MouseEvent;
}

export interface UpdatedEventInfo {
  event: EventObjectWithDefaultValues;
  changes: EventObject;
}

export interface DaynameInfo {
  date: string;
}

export interface EventInfo {
  event: EventObjectWithDefaultValues;
  nativeEvent: MouseEvent;
}

export interface MoreEventsButton {
  date: Date;
  target: HTMLDivElement; // NOTE: More events popup element
}

export type ExternalEventTypes = {
  selectDateTime: (info: SelectDateTimeInfo) => void;
  beforeCreateEvent: (event: EventObject) => void;
  beforeUpdateEvent: (updatedEventInfo: UpdatedEventInfo) => void;
  beforeDeleteEvent: (event: EventObjectWithDefaultValues) => void;
  afterRenderEvent: (event: EventObjectWithDefaultValues) => void;
  clickDayname: (daynameInfo: DaynameInfo) => void;
  clickEvent: (eventInfo: EventInfo) => void;
  clickMoreEventsBtn: (moreEventsBtnInfo: MoreEventsButton) => void;
  clickTimezonesCollapseBtn: (prevCollapsedState: boolean) => void;
  [eventName: string]: AnyFunc;
};
