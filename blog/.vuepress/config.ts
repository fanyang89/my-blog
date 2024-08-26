import { defineUserConfig } from "vuepress";
import { path } from "vuepress/utils";
import { viteBundler } from "@vuepress/bundler-vite";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/",
  lang: "zh-CN",
  title: "fanyang",
  description: "Focus on consensus, metadata service",
  theme,
  bundler: viteBundler(),
  alias: {
    "@theme-hope/components/HomePage": path.resolve(
      __dirname,
      "./components/HomePage.vue"
    ),
    "@theme-hope/components/NormalPage": path.resolve(
      __dirname,
      "./components/NormalPage.vue"
    ),
  },
});
