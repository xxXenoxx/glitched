export const PACKS = [
  {
    id: "chaos",
    name: "Everyday Chaos",
    description: "Small problems. Unhinged opinions.",
    tag: "EVERYONE",
  },
  {
    id: "friends",
    name: "Friendship Drama",
    description: "The group chat has entered evidence.",
    tag: "MESSY",
  },
  {
    id: "dating",
    name: "Dating Disasters",
    description: "Red flags and questionable chemistry.",
    tag: "DATING",
  },
  {
    id: "relationships",
    name: "Relationship Static",
    description: "Love, laundry, and little arguments.",
    tag: "COUPLES",
  },
  {
    id: "awkward",
    name: "Awkward Admissions",
    description: "Things you wish you hadn’t said.",
    tag: "FUNNY",
  },
  {
    id: "afterhours",
    name: "After Hours",
    description: "Flirty, suggestive, and a little reckless.",
    tag: "18+ · OPT IN",
  },
];
export const DEFAULT_SETTINGS = {
  rounds: 6,
  answer: 60,
  discussion: 90,
  vote: 30,
  packs: PACKS.filter((p) => p.id !== "afterhours").map((p) => p.id),
};
