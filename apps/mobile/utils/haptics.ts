import * as Haptics from 'expo-haptics';

let _enabled = true;

/** Check whether haptics are enabled */
export const isEnabled = () => _enabled;

/** Set the global haptics enabled flag (called by HapticsProvider) */
export const setEnabled = (v: boolean) => { _enabled = v; };

/** Light impact — button taps, selections, toggles, pills */
export const light = () => { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

/** Medium impact — modal snap, mode cycle, threshold crossing */
export const medium = () => { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };

/** Heavy impact — destructive threshold (swipe-to-delete) */
export const heavy = () => { if (_enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); };

/** Success notification — save, sync complete, trip added */
export const success = () => { if (_enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };

/** Warning notification — offline alert, error state */
export const warning = () => { if (_enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); };

/** Selection changed — station/calendar/option picked from a list */
export const selection = () => { if (_enabled) Haptics.selectionAsync(); };
