// Error text for the two anonymous entry points on the sign-in screen.

function anonymousSignInErrorText(message: string): string | null {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Anonymous sign-ins are off in this Supabase project. Turn on Authentication → Sign In / Providers → Allow anonymous sign-ins, then try again.";
  }
  return null;
}

// Guest entry only signs in; it never calls the mock-data function.
export function guestErrorText(message: string): string {
  return anonymousSignInErrorText(message) ?? message;
}

export function devModeErrorText(message: string): string {
  const signInError = anonymousSignInErrorText(message);
  if (signInError) return signInError;
  if (/seed_dev_mock_data|could not find the function/i.test(message)) {
    return "The mock-data function is missing. Apply the database migrations (supabase db push), then try again.";
  }
  return message;
}
