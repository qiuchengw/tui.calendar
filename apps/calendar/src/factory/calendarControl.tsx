import type { ComponentChild } from 'preact';
import { h, render } from 'preact';
import { unmountComponentAtNode } from 'preact/compat';
import renderToString from 'preact-render-to-string';

import type { DeepPartial } from 'ts-essentials';
import sendHostname from 'tui-code-snippet/request/sendHostname';

import { CalendarContainer } from '@src/calendarContainer';
import { GA_TRACKING_ID } from '@src/constants/statistics';
import { initCalendarStore } from '@src/contexts/calendarStore';
import { initThemeStore } from '@src/contexts/themeStore';
import { createDateMatrixOfMonth, getWeekDates } from '@src/helpers/grid';
import EventModel from '@src/model/eventModel';
import TZDate from '@src/time/date';
import { addDate, addMonths, toEndOfDay, toStartOfDay } from '@src/time/datetime';
import { last } from '@src/utils/array';
import type { EventBus } from '@src/utils/eventBus';
import { EventBusImpl } from '@src/utils/eventBus';
import { addAttributeHooks, removeAttributeHooks } from '@src/utils/sanitizer';
import { isNil, isPresent, isString } from '@src/utils/type';

import type { ExternalEventTypes } from '@t/eventBus';
import type { DateType, EventObject } from '@t/events';
import type { CalendarColor, CalendarInfo, Options, ViewType } from '@t/options';
import type {
  CalendarMonthOptions,
  CalendarState,
  CalendarStore,
  CalendarWeekOptions,
  Dispatchers,
  InternalStoreAPI,
} from '@t/store';
import type { ThemeState, ThemeStore } from '@t/theme';

export default abstract class CalendarControl implements EventBus<ExternalEventTypes> {
  protected container: Element | null;

  /**
   * start and end date of weekly, monthly
   * @type {object}
   * @private
   */
  protected renderRange: {
    start: TZDate;
    end: TZDate;
  };

  protected eventBus: EventBus<ExternalEventTypes>;

  protected theme: InternalStoreAPI<ThemeStore>;

  protected store: InternalStoreAPI<CalendarStore>;

  constructor(container: string | Element, options: Options = {}) {
    // NOTE: Handling server side rendering. When container is not specified,
    this.container = isString(container) ? document?.querySelector(container) ?? null : container;

    this.renderRange = {
      start: toStartOfDay(),
      end: toStartOfDay(),
    };

    this.theme = initThemeStore(options.theme);
    this.eventBus = new EventBusImpl<ExternalEventTypes>();
    this.store = initCalendarStore(options);

    addAttributeHooks();

    // NOTE: To make sure the user really wants to do this. Ignore any invalid values.
    if (this.getStoreState().options.usageStatistics === true) {
      sendHostname('calendar', GA_TRACKING_ID);
    }
  }

  protected abstract getComponent(): ComponentChild;

  protected getStoreState(): CalendarState;

  protected getStoreState<Group extends keyof CalendarState>(group: Group): CalendarState[Group];

  protected getStoreState<Group extends keyof CalendarState>(group?: Group) {
    const state = this.store.getState();

    return group ? state[group] : state;
  }

  protected getStoreDispatchers(): Dispatchers;

  protected getStoreDispatchers<Group extends keyof Dispatchers>(group: Group): Dispatchers[Group];

  protected getStoreDispatchers<Group extends keyof Dispatchers>(group?: Group) {
    const dispatchers = this.store.getState().dispatch;

    return group ? dispatchers[group] : dispatchers;
  }

  /**
   * Destroys the instance.
   */
  destroy() {
    if (this.container) {
      unmountComponentAtNode(this.container);
    }

    this.store.clearListeners();
    this.eventBus.off();
    removeAttributeHooks();

    for (const key in this) {
      if (this.hasOwnProperty(key)) {
        delete this[key];
      }
    }
  }

  private calculateMonthRenderDate({
    renderDate,
    offset,
    monthOptions,
  }: {
    renderDate: TZDate;
    offset: number;
    monthOptions: CalendarMonthOptions;
  }) {
    let newRenderDate = new TZDate(renderDate);
    const { visibleWeeksCount } = monthOptions;

    if (visibleWeeksCount > 0) {
      newRenderDate = addDate(newRenderDate, offset * 7 * visibleWeeksCount);
    } else {
      newRenderDate = addMonths(newRenderDate, offset);
    }
    const dateMatrix = createDateMatrixOfMonth(newRenderDate, monthOptions);

    const [[start]] = dateMatrix;
    const end = last(last(dateMatrix));

    return {
      renderDate: newRenderDate,
      renderRange: { start, end },
    };
  }

  private calculateWeekRenderDate({
    renderDate,
    offset,
    weekOptions,
  }: {
    renderDate: TZDate;
    offset: number;
    weekOptions: CalendarWeekOptions;
  }) {
    const newRenderDate = new TZDate(renderDate);
    newRenderDate.addDate(offset * 7);
    const weekDates = getWeekDates(newRenderDate, weekOptions);

    const [start] = weekDates;
    const end = last(weekDates);

    return {
      renderDate: newRenderDate,
      renderRange: { start, end },
    };
  }

  private calculateDayRenderDate({ renderDate, offset }: { renderDate: TZDate; offset: number }) {
    const newRenderDate = new TZDate(renderDate);
    newRenderDate.addDate(offset);

    const start = toStartOfDay(newRenderDate);
    const end = toEndOfDay(newRenderDate);

    return {
      renderDate: newRenderDate,
      renderRange: { start, end },
    };
  }

  /**
   * Move the rendered date to the next/prev range.
   *
   * The range of movement differs depending on the current view, Basically:
   *   - In month view, it moves to the next/prev month.
   *   - In week view, it moves to the next/prev week.
   *   - In day view, it moves to the next/prev day.
   *
   * Also, the range depends on the options like how many visible weeks/months should be rendered.
   *
   * @param {number} offset The offset to move by.
   *
   * @example
   * // Move to the next month in month view.
   * calendar.move(1);
   *
   * // Move to the next year in month view.
   * calendar.move(12);
   *
   * // Move to yesterday in day view.
   * calendar.move(-1);
   */
  move(offset: number) {
    if (isNil(offset)) {
      return;
    }

    const { currentView, renderDate } = this.getStoreState().view;
    const { options } = this.getStoreState();
    const { setRenderDate } = this.getStoreDispatchers().view;

    const newRenderDate = new TZDate(renderDate);

    let calculatedRenderDate = {
      renderDate: newRenderDate,
      renderRange: { start: new TZDate(newRenderDate), end: new TZDate(newRenderDate) },
    };

    if (currentView === 'month') {
      calculatedRenderDate = this.calculateMonthRenderDate({
        renderDate,
        offset,
        monthOptions: options.month as CalendarMonthOptions,
      });
    } else if (currentView === 'week') {
      calculatedRenderDate = this.calculateWeekRenderDate({
        renderDate,
        offset,
        weekOptions: options.week as CalendarWeekOptions,
      });
    } else if (currentView === 'day') {
      calculatedRenderDate = this.calculateDayRenderDate({ renderDate, offset });
    }

    setRenderDate(calculatedRenderDate.renderDate);
    this.renderRange = calculatedRenderDate.renderRange;
  }

  /**********
   * CRUD Methods
   **********/

  /**
   * Create events and render calendar.
   * @param {EventObject[]} events - list of {@link EventObject}
   * @example
   * calendar.createEvents([
   *   {
   *     id: '1',
   *     calendarId: '1',
   *     title: 'my event',
   *     category: 'time',
   *     dueDateClass: '',
   *     start: '2018-01-18T22:30:00+09:00',
   *     end: '2018-01-19T02:30:00+09:00',
   *   },
   *   {
   *     id: '2',
   *     calendarId: '1',
   *     title: 'second event',
   *     category: 'time',
   *     dueDateClass: '',
   *     start: '2018-01-18T17:30:00+09:00',
   *     end: '2018-01-19T17:31:00+09:00',
   *   },
   * ]);
   */
  createEvents(events: EventObject[]) {
    const { createEvents } = this.getStoreDispatchers('calendar');

    createEvents(events);
  }

  protected getEventModel(eventId: string, calendarId: string) {
    const { events } = this.getStoreState('calendar');

    return events.find(
      ({ id, calendarId: eventCalendarId }) => id === eventId && eventCalendarId === calendarId
    );
  }

  /**
   * Get an {@link EventObject} with event's id and calendar's id.
   *
   * @param {string} eventId - event's id
   * @param {string} calendarId - calendar's id of the event
   * @returns {EventObject | null} event. If the event can't be found, it returns null.
   *
   * @example
   * const event = calendar.getEvent(eventId, calendarId);
   *
   * console.log(event.title);
   */
  getEvent(eventId: string, calendarId: string) {
    return this.getEventModel(eventId, calendarId)?.toEventObject() ?? null;
  }

  /**
   * Update an event.
   *
   * @param {string} eventId - ID of an event to update
   * @param {string} calendarId - The calendarId of the event to update
   * @param {EventObject} changes - The new {@link EventObject} data to apply to the event
   *
   * @example
   * calendar.on('beforeUpdateEvent', function ({ event, changes }) {
   *   const { id, calendarId } = event;
   *
   *   calendar.updateEvent(id, calendarId, changes);
   * });
   */
  updateEvent(eventId: string, calendarId: string, changes: EventObject) {
    const { updateEvent } = this.getStoreDispatchers('calendar');
    const event = this.getEventModel(eventId, calendarId);

    if (event) {
      updateEvent({ event, eventData: changes });
    }
  }

  /**
   * Delete an event.
   *
   * @param {string} eventId - event's id to delete
   * @param {string} calendarId - The CalendarId of the event to delete
   */
  deleteEvent(eventId: string, calendarId: string) {
    const { deleteEvent } = this.getStoreDispatchers('calendar');
    const event = this.getEventModel(eventId, calendarId);

    if (event) {
      deleteEvent(event);
    }
  }

  /**********
   * General Methods
   **********/

  /**
   * Set events' visibility by calendar ID
   *
   * @param {string|string[]} calendarId - The calendar id or ids to change visibility
   * @param {boolean} isVisible - If set to true, show the events. If set to false, hide the events.
   */
  setCalendarVisibility(calendarId: string | string[], isVisible: boolean) {
    const { setCalendarVisibility } = this.getStoreDispatchers('calendar');
    const calendarIds = Array.isArray(calendarId) ? calendarId : [calendarId];

    setCalendarVisibility(calendarIds, isVisible);
  }

  /**
   * Render the calendar.
   *
   * @example
   * calendar.render();
   *
   * @example
   * // Re-render the calendar when resizing a window.
   * window.addEventListener('resize', () => {
   *   calendar.render();
   * });
   */
  render() {
    if (isPresent(this.container)) {
      render(
        <CalendarContainer theme={this.theme} store={this.store} eventBus={this.eventBus}>
          {this.getComponent()}
        </CalendarContainer>,
        this.container
      );
    }

    return this;
  }

  /**
   * For SSR(Server Side Rendering), Return the HTML string of the whole calendar.
   *
   * @returns {string} HTML string
   */
  renderToString(): string {
    return renderToString(
      <CalendarContainer theme={this.theme} store={this.store} eventBus={this.eventBus}>
        {this.getComponent()}
      </CalendarContainer>
    );
  }

  /**
   * Delete all events and clear view
   *
   * @example
   * calendar.clear();
   */
  clear() {
    const { clearEvents } = this.getStoreDispatchers('calendar');

    clearEvents();
  }

  /**
   * TODO: implement this
   * Scroll to current time on today in case of daily, weekly view.
   *
   * @example
   * function onNewEvents(events) {
   *     calendar.createEvents(events);
   *     if (calendar.getViewName() !== 'month') {
   *         calendar.scrollToNow();
   *     }
   * }
   */
  scrollToNow() {
    // console.log('scrollToNow');
  }

  /**
   * Move to today.
   *
   * @example
   * function onClickTodayBtn() {
   *   calendar.today();
   * }
   */
  today() {
    const { setRenderDate } = this.getStoreDispatchers().view;

    setRenderDate(new TZDate());
  }

  /**
   * Move to specific date.
   *
   * @param {DateType} date - The date to move
   * @example
   * calendar.on('clickDayname', (event) => {
   *   if (calendar.getViewName() === 'week') {
   *     const dateToMove = new Date(event.date);
   *
   *     calendar.setDate(dateToMove);
   *     calendar.changeView('day');
   *   }
   * });
   */
  setDate(date: DateType) {
    const { setRenderDate } = this.getStoreDispatchers('view');

    setRenderDate(new TZDate(date));
    // TODO: should update `this.renderRange`. Perhaps this method have to call `move` method?
  }

  /**
   * Move the calendar forward to the next range.
   *
   * @example
   * function moveToNextOrPrevRange(offset) {
   *   if (offset === -1) {
   *     calendar.prev();
   *   } else if (offset === 1) {
   *     calendar.next();
   *   }
   * }
   */
  next() {
    this.move(1);
  }

  /**
   * Move the calendar backward to the previous range.
   *
   * @example
   * function moveToNextOrPrevRange(offset) {
   *   if (offset === -1) {
   *     calendar.prev();
   *   } else if (offset === 1) {
   *     calendar.next();
   *   }
   * }
   */
  prev() {
    this.move(-1);
  }

  /**
   * Change color values of events belong to a certain calendar.
   *
   * @param {string} calendarId - The calendar ID
   * @param {CalendarColor} colorOptions - The {@link CalendarColor} object
   *
   * @example
   * calendar.setCalendarColor('1', {
   *     color: '#e8e8e8',
   *     backgroundColor: '#585858',
   *     borderColor: '#a1b56c',
   *     dragBackgroundColor: '#585858',
   * });
   * calendar.setCalendarColor('2', {
   *     color: '#282828',
   *     backgroundColor: '#dc9656',
   *     borderColor: '#a1b56c',
   *     dragBackgroundColor: '#dc9656',
   * });
   * calendar.setCalendarColor('3', {
   *     color: '#a16946',
   *     backgroundColor: '#ab4642',
   *     borderColor: '#a1b56c',
   *     dragBackgroundColor: '#ab4642',
   * });
   */
  setCalendarColor(calendarId: string, colorOptions: CalendarColor) {
    const { setCalendarColor } = this.getStoreDispatchers().calendar;

    setCalendarColor(calendarId, colorOptions);
  }

  /**
   * Change current view type.
   *
   * @param {ViewType} viewName - The new view name to change
   *
   * @example
   * // change to daily view
   * calendar.changeView('day');
   *
   * // change to weekly view
   * calendar.changeView('week');
   *
   * // change to monthly view
   * calendar.changeView('month');
   */
  changeView(viewName: ViewType) {
    const { changeView } = this.getStoreDispatchers('view');

    changeView(viewName);
  }

  /**
   * Get the DOM element of the event by event id and calendar id
   *
   * @param {string} eventId - ID of event
   * @param {string} calendarId - calendarId of event
   * @returns {HTMLElement} event element if found or null
   *
   * @example
   * const element = calendar.getElement(eventId, calendarId);
   *
   * console.log(element);
   */
  getElement(eventId: string, calendarId: string) {
    const event = this.getEvent(eventId, calendarId);

    if (event && this.container) {
      return this.container.querySelector(
        `[data-event-id="${eventId}"][data-calendar-id="${calendarId}"]`
      );
    }

    return null;
  }

  /**
   * Set the theme of the calendar.
   *
   * @param {DeepPartial<ThemeState>} theme - theme object
   *
   * @example
   * calendar.setTheme({
   *   common: {
   *     gridSelection: {
   *       backgroundColor: '#333',
   *     },
   *   },
   *   week: {
   *     currentTime: {
   *       color: '#00FF00',
   *     },
   *   },
   *   month: {
   *     dayname: {
   *       borderLeft: '1px solid #e5e5e5',
   *     },
   *   },
   * });
   */
  setTheme(theme: DeepPartial<ThemeState>) {
    const { setTheme } = this.theme.getState().dispatch;

    setTheme(theme);
  }

  /**
   * Get current {@link Options}.
   *
   * @returns {Options} options
   */
  getOptions() {
    const { options, template } = this.getStoreState();
    const { dispatch, ...theme } = this.theme.getState();

    return {
      ...options,
      template,
      theme,
    };
  }

  /**
   * Set options of calendar.
   *
   * @param {Options} options - set {@link Options}
   */
  setOptions({ theme, template, ...restOptions }: Options) {
    const { setTheme } = this.theme.getState().dispatch;
    const {
      options: { setOptions },
      template: { setTemplate },
    } = this.getStoreDispatchers();

    if (isPresent(theme)) {
      setTheme(theme);
    }

    if (isPresent(template)) {
      setTemplate(template);
    }

    setOptions(restOptions);
  }

  /**
   * Get current rendered date.
   *
   * @returns {TZDate}
   */
  getDate(): TZDate {
    const { renderDate } = this.getStoreState().view;

    return renderDate;
  }

  /**
   * Start time of rendered date range. ({@link TZDate} for further information)
   *
   * @returns {TZDate}
   */
  getDateRangeStart() {
    return this.renderRange.start;
  }

  /**
   * End time of rendered date range. ({@link TZDate} for further information)
   *
   * @returns {TZDate}
   */
  getDateRangeEnd() {
    return this.renderRange.end;
  }

  /**
   * Get current view name('day', 'week', 'month').
   *
   * @returns {ViewType} current view name
   */
  getViewName(): ViewType {
    const { currentView } = this.getStoreState('view');

    return currentView;
  }

  /**
   * Set calendar list.
   *
   * @param {CalendarInfo[]} calendars - list of calendars
   */
  setCalendars(calendars: CalendarInfo[]) {
    const { setCalendars } = this.getStoreDispatchers().calendar;

    setCalendars(calendars);
  }

  /**
   * TODO: specify position of popup
   *
   * Open event form popup with predefined form values.
   *
   * @param {EventObject} event - The preset {@link EventObject} data
   */
  openFormPopup(event: EventObject) {
    const { showFormPopup } = this.getStoreDispatchers().popup;

    const eventModel = new EventModel(event);
    const { title, location, start, end, isAllday, isPrivate, state: eventState } = eventModel;

    showFormPopup({
      isCreationPopup: true,
      event: eventModel,
      title,
      location,
      start,
      end,
      isAllday,
      isPrivate,
      eventState,
    });
  }

  fire<EventName extends keyof ExternalEventTypes>(
    eventName: EventName,
    ...args: Parameters<ExternalEventTypes[EventName]>
  ): EventBus<ExternalEventTypes> {
    this.eventBus.fire(eventName, ...args);

    return this;
  }

  off<EventName extends keyof ExternalEventTypes>(
    eventName?: EventName,
    handler?: ExternalEventTypes[EventName]
  ): EventBus<ExternalEventTypes> {
    this.eventBus.off(eventName, handler);

    return this;
  }

  on<EventName extends keyof ExternalEventTypes>(
    eventName: EventName,
    handler: ExternalEventTypes[EventName]
  ): EventBus<ExternalEventTypes> {
    this.eventBus.on(eventName, handler);

    return this;
  }

  once<EventName extends keyof ExternalEventTypes>(
    eventName: EventName,
    handler: ExternalEventTypes[EventName]
  ): EventBus<ExternalEventTypes> {
    this.eventBus.once(eventName, handler);

    return this;
  }
}
