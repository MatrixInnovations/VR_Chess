/**
 * Human-scale hall measurements and the Quest Pro frame budget.
 * The older board in `src/components/Board.tsx` uses 1-unit squares.
 * This lane uses meters so a seated player sees a real table.
 */

/** 5cm squares. An 8x8 board is 40cm across, a full-size tournament board. */
export const SQUARE_SIZE_M = 0.05

/** Top of the table, meters above the floor. */
export const TABLE_TOP_Y = 0.74

/** Thickness of each board square. */
export const SQUARE_THICKNESS_M = 0.012

/** Y of the surface pieces stand on. */
export const BOARD_SURFACE_Y = TABLE_TOP_Y + SQUARE_THICKNESS_M

/**
 * Seated eye height for an average adult in a chair.
 * Not a standing or overhead camera.
 */
export const SEATED_EYE_HEIGHT_M = 1.18

/**
 * Camera Z, just behind the near edge of the table on white's side.
 * Rank increases toward +Z, so white's back rank sits nearest the player.
 */
export const SEATED_EYE_Z_M = 0.62

/** How high a moving piece lifts at the middle of its arc, in meters. */
export const MOVE_ARC_LIFT_M = 0.03

/** Default slide duration. Short enough to read at 72fps, long enough to follow. */
export const MOVE_DURATION_MS = 280

/**
 * Pinch closes at 2cm and opens at 4cm.
 * The gap between them is hysteresis so a shaky hand does not flicker.
 */
export const PINCH_ENGAGE_M = 0.02

/** See {@link PINCH_ENGAGE_M}. */
export const PINCH_RELEASE_M = 0.04

/** Quest Pro refresh floor. Below this the lane logs a warning. */
export const QUEST_PRO_FPS_FLOOR = 72

/** Quest Pro refresh the hall is budgeted for. 90 is the panel's upper mode. */
export const QUEST_PRO_FPS_TARGET = 90
