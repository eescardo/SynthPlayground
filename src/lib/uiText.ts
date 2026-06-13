export const APP_NAME = "SynthSprout";

export const SUPPORT_EMAIL = "help@synthsprout.com";

export const UI_TEXT = {
  appDescription: "Playful browser-based synth and music playground.",
  about: {
    eyebrow: "About",
    purpose:
      `${APP_NAME} is a browser-based music composition and synthesis playground for sketching songs, designing ` +
      "patches, and exploring sound without leaving the creative surface.",
    terms:
      `${APP_NAME} is provided as-is for creative exploration, composition, patch design, and personal or ` +
      "project-based music work. You are responsible for the music, project files, presets, and audio you create, " +
      "export, publish, or share.",
    termsAvailability:
      `The app may change over time, and features may be revised, removed, or interrupted. ${APP_NAME} does not ` +
      "provide warranties that the app will be error-free or that exported work will be suitable for every purpose.",
    privacyIntro: `${APP_NAME} currently runs in your browser and does not require accounts.`
  },
  projectsMenu: {
    about: `About ${APP_NAME}`,
    deleteCurrentConfirmation: `${APP_NAME} will completely forget the current project. Are you sure you want to delete it?`
  }
} as const;
