import { actions } from "astro:actions";

export function LogoutButton() {
  async function logout() {
    await actions.logout.orThrow();
    window.Shoo?.clearIdentity?.();
    window.location.reload();
  }

  return (
    <button
      className="bg-transparent px-2 py-2 text-xs text-white/50 hover:text-white"
      onClick={logout}
      type="button"
    >
      Sign out
    </button>
  );
}
