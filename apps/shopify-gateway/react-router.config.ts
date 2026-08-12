import type { Config } from "@react-router/dev/config";

export default {
  buildDirectory: "dist",
  future: {
    v8_viteEnvironmentApi: true,
  },
  ssr: true,
} satisfies Config;
