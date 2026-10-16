import {
  getResource,
  type BarrierId,
  type InterestId,
  type Resource,
} from "../data/resources";

export interface TimelineStep {
  label: "TODAY" | "THIS WEEK" | "NEXT STEP";
  action: string;
}

export interface AlternativeRoute {
  title: string;
  description: string;
  resource: Resource;
}

export interface MatchResult {
  sectorLabel: string;
  firstAction: string;
  whyThisStep: string;
  resource: Resource;
  questionToAsk: string;
  timeline: readonly TimelineStep[];
  alternatives: readonly AlternativeRoute[];
  warnings: readonly string[];
}

interface SectorDetails {
  label: string;
  routePhrase: string;
  learningPhrase: string;
  subjectPhrase: string;
}

const sectorDetails: Record<InterestId, SectorDetails> = {
  engineering: {
    label: "engineering and technical",
    routePhrase: "engineering and technical routes",
    learningPhrase: "engineering and technical learning",
    subjectPhrase: "engineering and technical subject areas",
  },
  digital: {
    label: "digital and IT",
    routePhrase: "digital and IT routes",
    learningPhrase: "digital and IT learning",
    subjectPhrase: "digital and IT subject areas",
  },
  helping_people: {
    label: "health, care and education",
    routePhrase: "health, care and education routes",
    learningPhrase: "health, care and education learning",
    subjectPhrase: "health, care and education subject areas",
  },
  creative: {
    label: "creative arts and media",
    routePhrase: "creative arts and media routes",
    learningPhrase: "creative arts and media learning",
    subjectPhrase: "creative arts and media subject areas",
  },
  not_sure: {
    label: "different sectors",
    routePhrase: "routes across different sectors",
    learningPhrase: "learning across different sectors",
    subjectPhrase: "subject areas across different sectors",
  },
};

const collegeCourses = getResource("oldham-college-courses");
const collegeApprenticeships = getResource("oldham-college-apprenticeships");
const collegeSchoolLeavers = getResource("oldham-college-school-leavers");
const positiveSteps = getResource("positive-steps-careers");
const beeline = getResource("gmacs-beeline");

function routeAlternatives(sector: SectorDetails): readonly AlternativeRoute[] {
  return [
    {
      title: "Explore education and training",
      description: `Browse ${sector.subjectPhrase}, then ask which entry route fits your starting point.`,
      resource: collegeCourses,
    },
    {
      title: "Understand apprenticeships",
      description: "Learn how the earn-and-learn route works. This does not confirm a current opportunity.",
      resource: collegeApprenticeships,
    },
  ];
}

function notSureResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Talk to a Positive Steps careers adviser before choosing between ${sector.routePhrase}.`,
    whyThisStep: "When the choice itself feels unclear, a conversation can narrow the options before you spend time applying.",
    resource: positiveSteps,
    questionToAsk: `“Can you help me compare ${sector.routePhrase} and choose one next step?”`,
    timeline: [
      { label: "TODAY", action: "Write down one thing you enjoy doing or learning." },
      { label: "THIS WEEK", action: "Ask Positive Steps for a careers guidance conversation." },
      { label: "NEXT STEP", action: "Compare the routes you discussed with an adviser." },
    ],
    alternatives: [
      {
        title: "Discover possible careers",
        description: "Use Beeline for ideas, then bring the ones you like to an adviser.",
        resource: beeline,
      },
      ...routeAlternatives(sector).slice(0, 1),
    ],
    warnings: ["Places and personal eligibility not checked."],
  };
}

function experienceResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Explore entry routes into ${sector.learningPhrase}, including vocational courses, T Levels and apprenticeship guidance.`,
    whyThisStep: "A starting route can help you build practical experience; you do not need a finished CV to begin exploring.",
    resource: collegeCourses,
    questionToAsk: `“Which ${sector.routePhrase} are designed for someone without previous experience?”`,
    timeline: [
      { label: "TODAY", action: `Browse ${sector.subjectPhrase}.` },
      { label: "THIS WEEK", action: "Ask what entry routes are suitable for a first step." },
      { label: "NEXT STEP", action: "Compare a study route with apprenticeship guidance." },
    ],
    alternatives: routeAlternatives(sector),
    warnings: ["Places, entry requirements and personal eligibility not checked."],
  };
}

function travelResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Ask Oldham College where ${sector.learningPhrase} takes place and what travel support may be available before choosing a route.`,
    whyThisStep: "Travel can decide whether an option is realistic, so check location and support before comparing routes.",
    resource: collegeSchoolLeavers,
    questionToAsk: `“Where would I study for ${sector.routePhrase}, and what travel support could I ask about?”`,
    timeline: [
      { label: "TODAY", action: `Explore ${sector.routePhrase} without committing.` },
      { label: "THIS WEEK", action: "Ask Oldham College about learning locations and travel support." },
      { label: "NEXT STEP", action: "Discuss feasible course or apprenticeship routes with an adviser." },
    ],
    alternatives: routeAlternatives(sector),
    warnings: ["Travel feasibility not checked.", "Places and personal eligibility not checked."],
  };
}

function costResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Ask Oldham College what funding or bursary support may apply before choosing between ${sector.routePhrase}.`,
    whyThisStep: "Costs can change what feels possible, so get current support information before ruling an option in or out.",
    resource: collegeSchoolLeavers,
    questionToAsk: `“What costs come with these routes, and what funding or bursary support could I check?”`,
    timeline: [
      { label: "TODAY", action: "List the costs you are worried about, such as travel or equipment." },
      { label: "THIS WEEK", action: "Ask the provider what support information is current." },
      { label: "NEXT STEP", action: "Review the answer with a trusted adult or adviser." },
    ],
    alternatives: routeAlternatives(sector),
    warnings: ["Personal eligibility not checked.", "Costs and funding may change."],
  };
}

function learningSupportResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Ask Positive Steps for individual guidance on ${sector.routePhrase} and the support you can discuss with providers.`,
    whyThisStep: "A human adviser can listen to what helps you learn without this website making assumptions about your needs.",
    resource: positiveSteps,
    questionToAsk: "“Can we talk about what helps me learn and what support I should ask a provider about?”",
    timeline: [
      { label: "TODAY", action: "Note one thing that makes learning easier for you, if you want to share it." },
      { label: "THIS WEEK", action: "Arrange an individual guidance conversation." },
      { label: "NEXT STEP", action: "Ask a possible provider how support works on that route." },
    ],
    alternatives: routeAlternatives(sector),
    warnings: ["Support arrangements, places and personal eligibility not checked."],
  };
}

function confidenceResult(sector: SectorDetails): MatchResult {
  return {
    sectorLabel: sector.label,
    firstAction: `Arrange a supported first conversation with Positive Steps about ${sector.routePhrase}.`,
    whyThisStep: "You do not need to have everything worked out. Starting with one conversation keeps the first step small.",
    resource: positiveSteps,
    questionToAsk: "“Could we start with a short conversation about one option, without deciding today?”",
    timeline: [
      { label: "TODAY", action: "Write down how you would prefer to talk, then ask which formats are currently available." },
      { label: "THIS WEEK", action: "Ask Positive Steps for a first careers conversation." },
      { label: "NEXT STEP", action: "Pick one small follow-up with your adviser." },
    ],
    alternatives: [
      {
        title: "Build confidence with support",
        description: "See examples of youth engagement support and check current availability.",
        resource: getResource("positive-steps-empower"),
      },
      ...routeAlternatives(sector).slice(0, 1),
    ],
    warnings: ["Support availability, places and personal eligibility not checked."],
  };
}

export function matchFirstStep(interest: InterestId, barrier: BarrierId): MatchResult {
  const sector = sectorDetails[interest];
  const strategies: Record<BarrierId, () => MatchResult> = {
    not_sure: () => notSureResult(sector),
    experience: () => experienceResult(sector),
    travel: () => travelResult(sector),
    cost: () => costResult(sector),
    learning_support: () => learningSupportResult(sector),
    confidence: () => confidenceResult(sector),
  };

  return strategies[barrier]();
}
