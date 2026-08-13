import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
    // node-postgres is a server-only dependency. Keeping it external preserves
    // its optional pg-native fallback and avoids dev-server CJS interop errors.
    ssr: { external: ["pg", "pg-pool", "pg-native"] },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [vinext(), sites()],
});
