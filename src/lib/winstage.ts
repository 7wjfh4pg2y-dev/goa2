// The game-winning push and the victory card are ONE sequence played by two components:
// PushSplash runs the ceremony (the winners' crest ends large in the middle of the screen),
// then VictorySplash takes that same crest over, shrinks it into its seat and draws the
// title card under it. This is what the two agree on — GameView needs to know nothing.

/** the ceremony's stage: a point at 50% / STAGE_TOP of the window, in design px zoomed by the UI scale */
export const STAGE_TOP = 0.46;
/** where the winners' crest ends: its diameter, and its centre above the stage point (design px) */
export const CREST_D = 360, CREST_Y = -80;
/** the ceremony's length, and how long its last frame is held for the victory card to cover it */
export const WIN_MS = 4500, WIN_HOLD_MS = 6200;

/** set by PushSplash when a game-winning push starts playing (ms timestamps; 0 = none) */
export const winStage = { ready: 0, gone: 0 };
