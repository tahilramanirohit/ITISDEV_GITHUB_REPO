import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoalValues } from "../../lib/api/types";
import { GoalFields } from "./GoalFields";

afterEach(cleanup);

describe("GoalFields", () => {
  it("lets a player choose a goal and self-rating without treating it as a video score", () => {
    let value: GoalValues = {
      improvement_goals: [], positioning_rating: null,
      shot_outcomes_rating: null, shot_technique_rating: null,
    };
    const onChange = vi.fn((next: GoalValues) => { value = next; });
    const renderFields = () => render(<GoalFields value={value} onChange={onChange} />);
    const view = renderFields();
    fireEvent.click(screen.getByRole("checkbox", { name: "Shot outcomes" }));
    expect(value.improvement_goals).toEqual(["shot_outcomes"]);
    view.rerender(<GoalFields value={value} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Shot outcomes self rating"), { target: { value: "2" } });
    expect(value.shot_outcomes_rating).toBe(2);
    expect(screen.getByText(/your own assessment/i)).toBeTruthy();
  });
});
