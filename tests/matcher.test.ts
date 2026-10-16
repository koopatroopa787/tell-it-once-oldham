import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resources, type BarrierId, type InterestId } from "../src/data/resources";
import { matchFirstStep } from "../src/lib/matcher";

const expectedUrls = [
  "https://positive-steps.org.uk/services/career-guidance/",
  "https://positive-steps.org.uk/services/young-people-engagement-projects/",
  "https://www.oldham.ac.uk/study/school-leavers/",
  "https://www.oldham.ac.uk/study/school-leavers/courses/",
  "https://www.oldham.ac.uk/study/apprenticeships/",
  "https://gmacs.co.uk/",
  "https://gmacs.co.uk/beeline/",
  "https://www.gov.uk/know-when-you-can-leave-school",
];

describe("verified service resources", () => {
  it("contains only the eight approved provider entry points", () => {
    assert.deepEqual(
      resources.map((resource) => resource.url),
      expectedUrls,
    );
    assert.equal(new Set(resources.map((resource) => resource.id)).size, 8);
    assert.ok(resources.every((resource) => resource.url.startsWith("https://")));
  });
});

describe("barrier-first matching", () => {
  const cases: Array<{
    barrier: BarrierId;
    resourceId: string;
    actionIncludes: string;
    warningIncludes?: string;
  }> = [
    {
      barrier: "not_sure",
      resourceId: "positive-steps-careers",
      actionIncludes: "careers adviser",
    },
    {
      barrier: "experience",
      resourceId: "oldham-college-courses",
      actionIncludes: "entry routes",
    },
    {
      barrier: "travel",
      resourceId: "oldham-college-school-leavers",
      actionIncludes: "travel support",
      warningIncludes: "Travel feasibility not checked.",
    },
    {
      barrier: "cost",
      resourceId: "oldham-college-school-leavers",
      actionIncludes: "funding or bursary support",
      warningIncludes: "Personal eligibility not checked.",
    },
    {
      barrier: "learning_support",
      resourceId: "positive-steps-careers",
      actionIncludes: "individual guidance",
    },
    {
      barrier: "confidence",
      resourceId: "positive-steps-careers",
      actionIncludes: "supported first conversation",
    },
  ];

  for (const testCase of cases) {
    it(`returns the distinct ${testCase.barrier} strategy`, () => {
      const result = matchFirstStep("engineering", testCase.barrier);

      assert.equal(result.resource.id, testCase.resourceId);
      assert.match(result.firstAction.toLowerCase(), new RegExp(testCase.actionIncludes));
      assert.ok(result.whyThisStep.length > 20);
      if (testCase.warningIncludes) {
        assert.ok(result.warnings.includes(testCase.warningIncludes));
      }
    });
  }

  it("changes the whole handoff when the barrier changes", () => {
    const travel = matchFirstStep("engineering", "travel");
    const uncertain = matchFirstStep("engineering", "not_sure");

    assert.notEqual(travel.firstAction, uncertain.firstAction);
    assert.notEqual(travel.whyThisStep, uncertain.whyThisStep);
    assert.notEqual(travel.resource.id, uncertain.resource.id);
    assert.notEqual(travel.questionToAsk, uncertain.questionToAsk);
  });

  it("uses interest only to personalise the possible sector", () => {
    const interests: InterestId[] = [
      "engineering",
      "digital",
      "helping_people",
      "creative",
      "not_sure",
    ];

    const actions = interests.map((interest) => matchFirstStep(interest, "travel"));
    assert.ok(actions.every((result) => result.resource.id === "oldham-college-school-leavers"));
    assert.equal(new Set(actions.map((result) => result.sectorLabel)).size, 5);
  });

  it("returns a safe, portable result shape", () => {
    const result = matchFirstStep("digital", "experience");
    const visibleCopy = [
      result.firstAction,
      result.whyThisStep,
      result.questionToAsk,
      ...result.timeline.map((step) => step.action),
      ...result.alternatives.map((route) => `${route.title} ${route.description}`),
    ].join(" ").toLowerCase();

    assert.equal(result.timeline.length, 3);
    assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 2);
    assert.ok(expectedUrls.includes(result.resource.url));
    for (const forbidden of ["match percentage", "guaranteed place", "wage figure", "active vacancy"]) {
      assert.ok(!visibleCopy.includes(forbidden));
    }
  });
});
