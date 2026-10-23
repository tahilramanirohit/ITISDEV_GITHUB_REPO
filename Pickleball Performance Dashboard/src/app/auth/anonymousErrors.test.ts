import { devModeErrorText, guestErrorText } from "./anonymousErrors";

describe("anonymous entry errors", () => {
  it("explains disabled anonymous sign-ins for both entry points", () => {
    expect(guestErrorText("Anonymous sign-ins are disabled")).toMatch(/Allow anonymous sign-ins/);
    expect(devModeErrorText("Anonymous sign-ins are disabled")).toMatch(/Allow anonymous sign-ins/);
  });

  it("never blames the mock-data function for a guest sign-in failure", () => {
    const message = "Could not find the function in the schema cache";
    expect(guestErrorText(message)).toBe(message);
    expect(devModeErrorText(message)).toMatch(/mock-data function is missing/);
  });
});
