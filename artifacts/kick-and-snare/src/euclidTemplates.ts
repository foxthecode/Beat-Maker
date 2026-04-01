/**
 * Euclidean Sequencer Templates
 * Sources: Toussaint (2005) "The Euclidean Algorithm Generates Traditional Musical Rhythms"
 *          + African/Cuban/Balkan/Indian musicology
 *
 * Each template defines per-track euclidean parameters:
 *   { hits, N, rot }  →  E(hits, N) with optional rotation
 *
 * Icons: circle/polygon Unicode to match the EUCLID aesthetic.
 */

export interface EuclidTrackParam {
  hits: number;   // k — number of onsets
  N: number;      // n — total number of steps
  rot?: number;   // rotation offset (default 0)
}

export interface EuclidTemplate {
  id: string;
  name: string;
  genre: string;
  icon: string;   // circle/polygon symbol
  bpm?: number;
  color: string;
  description: string;
  params: Partial<Record<string, EuclidTrackParam>>;
}

// ─────────────────────────────────────────────────────────────────────────────
export const EUCLID_TEMPLATES: EuclidTemplate[] = [

  // ── 1. Cuban Tresillo ─────────────────────────────────────────────────────
  // E(3,8) — the root of all Afro-Cuban rhythm, foundation of blues & rock
  {
    id: "tresillo",
    name: "Tresillo",
    genre: "AFRO-CUB",
    icon: "◉",
    bpm: 96,
    color: "#FF9500",
    description: "E(3,8) — Afro-Cuban tresillo. Foundation of blues, jazz & hip-hop.",
    params: {
      kick:  { hits: 3, N: 8, rot: 0 },   // E(3,8): [1,0,0,1,0,0,1,0]
      clap:  { hits: 2, N: 8, rot: 2 },   // E(2,8): off-beats
      hihat: { hits: 8, N: 8, rot: 0 },   // steady 8ths
    },
  },

  // ── 2. Cuban Cinquillo ────────────────────────────────────────────────────
  // E(5,8) — Cuban & Andalusian, the most syncopated 8-step pattern
  {
    id: "cinquillo",
    name: "Cinquillo",
    genre: "AFRO-CUB",
    icon: "⬠",
    bpm: 104,
    color: "#FFD60A",
    description: "E(5,8) — Cuban cinquillo. The most syncopated rhythm in Afro-Cuban music.",
    params: {
      kick:  { hits: 5, N: 8, rot: 0 },   // E(5,8): [1,0,1,1,0,1,1,0]
      snare: { hits: 3, N: 8, rot: 1 },   // E(3,8) offset by 1
      hihat: { hits: 8, N: 8, rot: 0 },
    },
  },

  // ── 3. Son Clave 3-2 ──────────────────────────────────────────────────────
  // The defining rhythm of Cuban son, salsa, and mambo
  {
    id: "son_clave",
    name: "Son Clave 3-2",
    genre: "CLAVE",
    icon: "◈",
    bpm: 108,
    color: "#FF2D55",
    description: "Son clave 3-2 — structural backbone of salsa, mambo & Cuban son.",
    params: {
      kick:  { hits: 3, N: 16, rot: 0 },  // 3 side: hits 1, 2.5, 4
      clap:  { hits: 2, N: 16, rot: 8 },  // 2 side: hits 1, 3 of bar 2
      hihat: { hits: 4, N: 16, rot: 0 },  // quarter notes
      perc:  { hits: 5, N: 16, rot: 3 },  // conga tumba
    },
  },

  // ── 4. West African Bell (7/12) ───────────────────────────────────────────
  // E(7,12) — Ewe bell pattern, fundamental to West African ensemble music
  {
    id: "west_african_bell",
    name: "West African Bell",
    genre: "AFRO",
    icon: "○",
    bpm: 120,
    color: "#30D158",
    description: "E(7,12) — Ewe, Yoruba & Fon bell. Core of African ensemble timekeeping.",
    params: {
      ride:  { hits: 7, N: 12, rot: 0 },  // bell pattern E(7,12)
      kick:  { hits: 3, N: 12, rot: 0 },  // low drum E(3,12)
      perc:  { hits: 5, N: 12, rot: 2 },  // mid drum E(5,12)
      hihat: { hits: 4, N: 12, rot: 0 },  // hi drum E(4,12)
    },
  },

  // ── 5. Bulgarian Ruchenitza (7/8) ─────────────────────────────────────────
  // E(4,7) over 7 steps — traditional Bulgarian & Balkan asymmetric meter
  {
    id: "ruchenitza",
    name: "Ruchenitza",
    genre: "BALKAN",
    icon: "⬡",
    bpm: 138,
    color: "#BF5AF2",
    description: "E(4,7) — Ruchenitza (Bulgaria). 7/8 asymmetric folk meter.",
    params: {
      kick:  { hits: 4, N: 7, rot: 0 },   // E(4,7): [1,0,1,0,1,0,1]
      snare: { hits: 3, N: 7, rot: 1 },   // E(3,7): [1,0,1,0,1,0,0]
      hihat: { hits: 7, N: 7, rot: 0 },   // all steps
      perc:  { hits: 2, N: 7, rot: 3 },   // off-accent E(2,7)
    },
  },

  // ── 6. Aksak — Turkish 9/8 ───────────────────────────────────────────────
  // E(4,9) — Aksak ("limping"), widespread in Turkish and Middle Eastern music
  {
    id: "aksak",
    name: "Aksak 9/8",
    genre: "TURKISH",
    icon: "◇",
    bpm: 132,
    color: "#64D2FF",
    description: "E(4,9) — Aksak ('limping'). Turkish 9/8, asymmetric Middle Eastern groove.",
    params: {
      kick:  { hits: 4, N: 9, rot: 0 },   // E(4,9): [1,0,1,0,1,0,1,0,0]
      snare: { hits: 2, N: 9, rot: 2 },   // E(2,9)
      hihat: { hits: 9, N: 9, rot: 0 },   // all steps
      perc:  { hits: 3, N: 9, rot: 1 },   // E(3,9)
    },
  },

  // ── 7. Steve Reich — 5 against 3 (Phase) ─────────────────────────────────
  // Classic minimalist polyrhythm: E(5,16) vs E(3,16), source of all phasing music
  {
    id: "reich_phase",
    name: "Reich Phase 5:3",
    genre: "MINIMAL",
    icon: "⊕",
    bpm: 120,
    color: "#5E5CE6",
    description: "E(5,16) vs E(3,16) — Steve Reich phasing principle. 5-against-3 polyrhythm.",
    params: {
      kick:  { hits: 5, N: 16, rot: 0 },  // E(5,16): [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0]
      snare: { hits: 3, N: 16, rot: 0 },  // E(3,16): [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0]
      hihat: { hits: 7, N: 16, rot: 0 },  // E(7,16): Afro-Brazilian
      perc:  { hits: 2, N: 16, rot: 8 },  // E(2,16): back-beat anchor
    },
  },

  // ── 8. 4-against-3 (Hemiola) ─────────────────────────────────────────────
  // The most fundamental polyrhythm in Western and African music
  {
    id: "hemiola_4_3",
    name: "Hemiola 4:3",
    genre: "POLY",
    icon: "⊗",
    bpm: 100,
    color: "#FF375F",
    description: "E(4,12) vs E(3,12) — Classical hemiola. 4-against-3, felt in all genres.",
    params: {
      kick:  { hits: 4, N: 12, rot: 0 },  // E(4,12): quarter notes in 3/4
      snare: { hits: 3, N: 12, rot: 0 },  // E(3,12): triplet feel
      hihat: { hits: 6, N: 12, rot: 0 },  // E(6,12): 8th notes
      clap:  { hits: 2, N: 12, rot: 6 },  // E(2,12): back-beat
    },
  },

  // ── 9. Nawakhat — Arabic 5/7 ──────────────────────────────────────────────
  // E(5,7) — used in Arab maqam music, creates dense syncopation
  {
    id: "nawakhat",
    name: "Nawakhat 5:7",
    genre: "ARABIC",
    icon: "◯",
    bpm: 116,
    color: "#FF9F0A",
    description: "E(5,7) — Nawakhat (Arab). 7-step cycle with 5 beats, lopsided groove.",
    params: {
      kick:  { hits: 5, N: 7, rot: 0 },   // E(5,7): [1,0,1,1,0,1,1]
      perc:  { hits: 3, N: 7, rot: 2 },   // E(3,7): Ruchenitza
      hihat: { hits: 7, N: 7, rot: 0 },   // all 7 steps
      snare: { hits: 2, N: 7, rot: 3 },   // sparse accent E(2,7)
    },
  },

  // ── 10. Bossa Nova Bell (Samba Padrão) ───────────────────────────────────
  // E(5,16) on hi-hat, E(3,8) on kick — classic bossa groove
  {
    id: "bossa_bell",
    name: "Bossa Bell",
    genre: "BOSSA",
    icon: "◎",
    bpm: 110,
    color: "#30D158",
    description: "E(3,8) kick + E(5,16) bell — Bossa Nova / Samba Padrão rhythm cell.",
    params: {
      kick:  { hits: 3, N: 8, rot: 0 },   // E(3,8): tresillo base
      ride:  { hits: 5, N: 16, rot: 0 },  // E(5,16): bossa bell
      hihat: { hits: 2, N: 8, rot: 4 },   // E(2,8): back-beat
      perc:  { hits: 5, N: 8, rot: 1 },   // E(5,8): cinquillo on shaker
    },
  },

  // ── 11. Kpanlogo — Ga (Ghana) ─────────────────────────────────────────────
  // E(5,9) is the Kpanlogo master drum pattern, central to Ga youth music
  {
    id: "kpanlogo",
    name: "Kpanlogo",
    genre: "GHANA",
    icon: "⬢",
    bpm: 104,
    color: "#FFD60A",
    description: "E(5,9) — Kpanlogo (Ga, Ghana). Central African youth dance rhythm.",
    params: {
      kick:  { hits: 5, N: 9, rot: 0 },   // E(5,9): [1,0,1,0,1,0,1,0,1]
      snare: { hits: 2, N: 9, rot: 1 },   // E(2,9) offset
      perc:  { hits: 3, N: 9, rot: 4 },   // E(3,9) counter
      hihat: { hits: 9, N: 9, rot: 0 },   // all 9ths
    },
  },

  // ── 12. Venda — Southern Africa 5/12 ──────────────────────────────────────
  // E(5,12) — Venda people of South Africa, also appears in Eastern Europe
  {
    id: "venda",
    name: "Venda 5:12",
    genre: "AFRICA",
    icon: "△",
    bpm: 118,
    color: "#FF6B35",
    description: "E(5,12) — Venda (South Africa). 5-onset 12-step, used in tshikona flute.",
    params: {
      kick:  { hits: 5, N: 12, rot: 0 },  // E(5,12): [1,0,0,1,0,0,1,0,0,1,0,1]
      snare: { hits: 7, N: 12, rot: 2 },  // E(7,12): West African bell as snare
      hihat: { hits: 4, N: 12, rot: 0 },  // E(4,12): quarter anchors
      perc:  { hits: 3, N: 12, rot: 5 },  // E(3,12): sparse perc
    },
  },

];
