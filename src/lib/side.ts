/** Cookie remembering which side (client or admin) a staff member used last. */
export const SIDE_COOKIE = "side";

export function rememberSide(side: "client" | "admin") {
  document.cookie = `${SIDE_COOKIE}=${side}; path=/; max-age=31536000; samesite=lax`;
}
