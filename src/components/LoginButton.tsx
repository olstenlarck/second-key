export function LoginButton() {
  return (
    <button
      className="mt-8 w-full bg-acid px-5 py-4 font-bold text-ink transition hover:translate-x-1 hover:translate-y-1"
      onClick={() => window.Shoo?.startSignIn({ requestPii: true, returnTo: "/" })}
      type="button"
    >
      Continue with Google →
    </button>
  );
}
