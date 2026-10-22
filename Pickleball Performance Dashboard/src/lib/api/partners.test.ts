import { describe, expect, it } from "vitest";
import { formatCode, formatVideoTime, normalizeCode, partnerErrorText } from "./partners";

describe("invite codes", () => {
  it("accepts codes typed with spaces, dashes or lower case", () => {
    expect(normalizeCode(" k7p4-qx9m ")).toBe("K7P4QX9M");
    expect(formatCode("K7P4QX9M")).toBe("K7P4-QX9M");
  });
});

describe("video times", () => {
  it("reads like a video player", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(42.5)).toBe("0:42");
    expect(formatVideoTime(125)).toBe("2:05");
    expect(formatVideoTime(3725)).toBe("1:02:05");
    expect(formatVideoTime(null)).toBe("");
  });
});

describe("error messages", () => {
  it("shows the database's own explanation without its prefix", () => {
    expect(partnerErrorText(new Error("partners: this code is not valid or has expired; ask for a new one")))
      .toBe("This code is not valid or has expired; ask for a new one");
  });
  it("names the missing database update", () => {
    expect(partnerErrorText(new Error("Could not find the function public.my_partners without parameters in the schema cache")))
      .toMatch(/pickleproapp_upgrade_7\.sql/);
  });
});
