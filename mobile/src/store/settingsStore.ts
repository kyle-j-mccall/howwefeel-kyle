import { create } from 'zustand';

interface NotificationPrefs {
  frequency: number;
  startHour: number;
  endHour: number;
  days: boolean[];
}

interface SettingsState {
  notifications: NotificationPrefs;
  setFrequency: (freq: number) => void;
  setStartHour: (hour: number) => void;
  setEndHour: (hour: number) => void;
  toggleDay: (index: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  notifications: {
    frequency: 2,
    startHour: 9,
    endHour: 21,
    days: [true, true, true, true, true, true, true],
  },
  setFrequency: (freq) =>
    set((s) => ({ notifications: { ...s.notifications, frequency: freq } })),
  setStartHour: (hour) =>
    set((s) => ({ notifications: { ...s.notifications, startHour: hour } })),
  setEndHour: (hour) =>
    set((s) => ({ notifications: { ...s.notifications, endHour: hour } })),
  toggleDay: (index) =>
    set((s) => {
      const days = [...s.notifications.days];
      days[index] = !days[index];
      return { notifications: { ...s.notifications, days } };
    }),
}));
