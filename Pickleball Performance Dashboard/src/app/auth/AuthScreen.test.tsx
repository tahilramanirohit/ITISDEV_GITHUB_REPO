import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthScreen } from "./AuthScreen";

afterEach(cleanup);

function renderWith(signUpResult: unknown) {
  const signUp = vi.fn().mockResolvedValue(signUpResult);
  const sb = { auth: { signUp } } as unknown as SupabaseClient;
  render(<AuthScreen sb={sb} />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to create account" }));
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
  fireEvent.click(screen.getByRole("button", { name: /^Create account/ }));
  return signUp;
}

describe("AuthScreen sign-up", () => {
  it("asks a new user to confirm their email", async () => {
    renderWith({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    expect(await screen.findByText(/Check your email to confirm/)).toBeTruthy();
  });

  it("sends an existing email to sign in (confirmation on: user with no identities)", async () => {
    renderWith({ data: { user: { id: "fake", identities: [] }, session: null }, error: null });
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(screen.queryByText(/Check your email to confirm/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Sign in/ })).toBeTruthy();
  });

  it("sends an existing email to sign in (confirmation off: user_already_exists error)", async () => {
    renderWith({ data: { user: null, session: null }, error: { code: "user_already_exists", message: "User already registered" } });
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });
});

it("offers Google in both account modes and uses the app return URL", async () => {
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: { message: "not configured" } });
  render(<AuthScreen sb={{ auth: { signInWithOAuth } } as unknown as SupabaseClient} />);
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Switch to create account" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(await screen.findByText(/Google sign-in couldn't start/)).toBeTruthy();
  expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
});
