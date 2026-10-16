export type InterestId =
  | "engineering"
  | "digital"
  | "helping_people"
  | "creative"
  | "not_sure";

export type BarrierId =
  | "not_sure"
  | "experience"
  | "travel"
  | "cost"
  | "learning_support"
  | "confidence";

export interface Choice<T extends string> {
  id: T;
  label: string;
  shortLabel: string;
}

export interface Resource {
  id: string;
  organisation: string;
  label: string;
  url: string;
  sectorTags: readonly string[];
  purpose: string;
}

export const interestOptions: readonly Choice<InterestId>[] = [
  { id: "engineering", label: "Engineering", shortLabel: "Engineering" },
  { id: "digital", label: "Digital & IT", shortLabel: "Digital & IT" },
  { id: "helping_people", label: "Helping people", shortLabel: "Helping people" },
  { id: "creative", label: "Creative", shortLabel: "Creative" },
  { id: "not_sure", label: "Not sure yet", shortLabel: "Not sure yet" },
];

export const barrierOptions: readonly Choice<BarrierId>[] = [
  { id: "not_sure", label: "Not sure where to start", shortLabel: "Not sure where to start" },
  { id: "experience", label: "No experience", shortLabel: "No experience" },
  { id: "travel", label: "Travel is difficult", shortLabel: "Travel is difficult" },
  { id: "cost", label: "Worried about costs", shortLabel: "Worried about costs" },
  { id: "learning_support", label: "Need learning support", shortLabel: "Need learning support" },
  { id: "confidence", label: "Low confidence", shortLabel: "Low confidence" },
];

export const resources: readonly Resource[] = [
  {
    id: "positive-steps-careers",
    organisation: "Positive Steps",
    label: "Careers Guidance",
    url: "https://positive-steps.org.uk/services/career-guidance/",
    sectorTags: ["all", "human-support"],
    purpose: "Talk through next-step options with a careers adviser.",
  },
  {
    id: "positive-steps-empower",
    organisation: "Positive Steps",
    label: "Youth engagement and Empower Oldham",
    url: "https://positive-steps.org.uk/services/young-people-engagement-projects/",
    sectorTags: ["all", "confidence", "re-engagement"],
    purpose: "Explore support whose current availability and eligibility must be checked.",
  },
  {
    id: "oldham-college-school-leavers",
    organisation: "Oldham College",
    label: "School Leavers",
    url: "https://www.oldham.ac.uk/study/school-leavers/",
    sectorTags: ["all", "courses", "t-levels"],
    purpose: "Explore 16–18 study routes and the support available around them.",
  },
  {
    id: "oldham-college-courses",
    organisation: "Oldham College",
    label: "16–18 Courses",
    url: "https://www.oldham.ac.uk/study/school-leavers/courses/",
    sectorTags: ["engineering", "digital", "helping_people", "creative"],
    purpose: "Browse current subject areas without assuming a place or entry route.",
  },
  {
    id: "oldham-college-apprenticeships",
    organisation: "Oldham College",
    label: "Apprenticeships",
    url: "https://www.oldham.ac.uk/study/apprenticeships/",
    sectorTags: ["engineering", "digital", "helping_people", "creative"],
    purpose: "Understand the apprenticeship route and check current information.",
  },
  {
    id: "gmacs",
    organisation: "GMACS",
    label: "Careers and apprenticeship information",
    url: "https://gmacs.co.uk/",
    sectorTags: ["all", "careers", "apprenticeships"],
    purpose: "Explore Greater Manchester careers and apprenticeship information.",
  },
  {
    id: "gmacs-beeline",
    organisation: "GMACS",
    label: "Beeline career discovery",
    url: "https://gmacs.co.uk/beeline/",
    sectorTags: ["all", "career-discovery"],
    purpose: "Discover possible careers before turning an idea into an action.",
  },
  {
    id: "gov-school-leaving",
    organisation: "GOV.UK",
    label: "School leaving age guidance",
    url: "https://www.gov.uk/know-when-you-can-leave-school",
    sectorTags: ["all", "official-guidance"],
    purpose: "Check the official education and training rules for ages 16–17.",
  },
];

export function getResource(id: string): Resource {
  const resource = resources.find((candidate) => candidate.id === id);
  if (!resource) {
    throw new Error(`Unknown resource: ${id}`);
  }
  return resource;
}

export function getInterestLabel(id: InterestId): string {
  return interestOptions.find((choice) => choice.id === id)?.label ?? "Not sure yet";
}

export function getBarrierLabel(id: BarrierId): string {
  return barrierOptions.find((choice) => choice.id === id)?.label ?? "Not sure where to start";
}
