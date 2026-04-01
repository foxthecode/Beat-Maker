/** Sequencer Templates — 16-step patterns (4/4, 1/16 grid)
 *  Each template describes only the tracks it uses; all others are zeroed on load.
 *  step index: 0=beat1, 4=beat2, 8=beat3, 12=beat4
 */
export interface DrumTemplate {
  id: string;
  name: string;
  genre: string;
  bpm?: number;
  color: string;
  steps: Partial<Record<string, number[]>>;
}

// Helper: 16 zeros
const z16 = (): number[] => Array(16).fill(0);

export const SEQUENCER_TEMPLATES: DrumTemplate[] = [
  {
    id: "classic_808",
    name: "808 Classic",
    genre: "HIP HOP",
    bpm: 90,
    color: "#FF2D55",
    steps: {
      kick:  [1,0,0,0, 0,1,0,0, 1,0,0,0, 0,0,1,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
  },
  {
    id: "trap",
    name: "Trap",
    genre: "TRAP",
    bpm: 140,
    color: "#BF5AF2",
    steps: {
      kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    },
  },
  {
    id: "house",
    name: "House",
    genre: "HOUSE",
    bpm: 128,
    color: "#FF9500",
    steps: {
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    },
  },
  {
    id: "jazz",
    name: "Jazz Swing",
    genre: "JAZZ",
    bpm: 120,
    color: "#64D2FF",
    steps: {
      kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,1],
      ride:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
  },
  {
    id: "bossa",
    name: "Bossa Nova",
    genre: "LATIN",
    bpm: 110,
    color: "#30D158",
    steps: {
      kick:  [1,0,0,0, 0,0,0,1, 0,0,0,0, 1,0,0,0],
      snare: [0,0,1,0, 0,1,0,0, 0,1,0,0, 0,0,1,0],
      hihat: [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
    },
  },
  {
    id: "reggae",
    name: "Reggae",
    genre: "REGGAE",
    bpm: 75,
    color: "#30D158",
    steps: {
      kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      ride:  [0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,1],
    },
  },
  {
    id: "dnb",
    name: "Drum & Bass",
    genre: "DnB",
    bpm: 174,
    color: "#FF375F",
    steps: {
      kick:  [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
      snare: [0,0,0,1, 1,0,0,0, 0,0,1,0, 0,1,0,0],
      hihat: [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1],
    },
  },
  {
    id: "hiphop",
    name: "Boom Bap",
    genre: "HIP HOP",
    bpm: 85,
    color: "#FF9500",
    steps: {
      kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      clap:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0],
    },
  },
  {
    id: "techno",
    name: "Techno 909",
    genre: "TECHNO",
    bpm: 135,
    color: "#5E5CE6",
    steps: {
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    },
  },
  {
    id: "afrobeat",
    name: "Afrobeat",
    genre: "AFRO",
    bpm: 100,
    color: "#FFD60A",
    steps: {
      kick:  [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,1,0],
      snare: [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      hihat: [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1],
      perc:  [0,1,0,0, 1,0,0,1, 0,1,0,0, 1,0,0,1],
    },
  },
  {
    id: "funk",
    name: "Funk",
    genre: "FUNK",
    bpm: 100,
    color: "#FF2D55",
    steps: {
      kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0],
      snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
      hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,1,0,1],
    },
  },
  {
    id: "samba",
    name: "Samba",
    genre: "SAMBA",
    bpm: 120,
    color: "#30D158",
    steps: {
      kick:  [1,0,0,0, 0,1,0,0, 1,0,0,0, 0,1,0,0],
      snare: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0],
      hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      perc:  [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1],
    },
  },
];

export const ALL_TRACK_IDS = ["kick","snare","hihat","clap","tom","ride","crash","perc"];
