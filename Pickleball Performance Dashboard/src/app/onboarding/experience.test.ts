import { expect, it } from "vitest";
import { nearestExperience } from "./experience";
it("maps legacy experience answers to the five approved tiles", () => {
  expect([0, 0.5, 1.5, 3, 5].map(nearestExperience)).toEqual([0.1, 0.4, 1.5, 3, 3]);
  expect(nearestExperience(null)).toBeNull();
});
