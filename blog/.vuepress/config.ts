import { defineUserConfig } from "vuepress";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/",
  lang: "zh-CN",
  title: "fanyang",
  description: "Focus on consensus, metadata service",
  theme,
});
