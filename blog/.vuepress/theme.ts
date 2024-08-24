import { hopeTheme } from "vuepress-theme-hope";

import navbar from "./navbar.js";
import sidebar from "./sidebar.js";

const hostname = "https://fanyang.vercel.app";

export default hopeTheme({
  hostname: hostname,

  author: {
    name: "fanyang",
    url: hostname,
  },

  iconAssets: "fontawesome-with-brands",

  // github repo
  repo: "fanyang89/my-blog",
  docsDir: "blog",

  navbar,
  sidebar,

  footer: "",
  displayFooter: true,

  blog: {
    description: "全干工程师，副业分布式系统",
    intro: "/intro.html",
    medias: {
      Email: "mailto:fanyang@smartx.com",
      GitHub: "https://github.com/fanyang89",
    },
  },

  encrypt: {
    config: {
      "/demo/encrypt.html": ["jK4P7rqr5bbaqTPj"],
    },
  },

  // disable by default
  // https://theme-hope.vuejs.press/zh/guide/blog/intro.html#%E9%99%90%E5%88%B6
  hotReload: false,

  plugins: {
    blog: true,
    searchPro: true,

    comment: {
      provider: "Giscus",
      repo: "fanyang89/my-blog",
      repoId: "R_kgDOMmVl5w",
      category: "Announcements",
      categoryId: "DIC_kwDOMmVl584Ch5MD",
      mapping: "pathname",
      strict: false,
      reactionsEnabled: true,
      inputPosition: "top",
      lazyLoading: true,
    },

    components: {
      components: ["Badge", "VPCard"],
    },

    mdEnhance: {
      // https://theme-hope.vuejs.press/zh/guide/markdown/stylize/alert.html
      alert: true,
      // https://theme-hope.vuejs.press/zh/guide/markdown/stylize/align.html
      align: true,
      // https://theme-hope.vuejs.press/zh/guide/markdown/stylize/attrs.html
      attrs: true,
      codetabs: true,
      component: true,
      demo: true,
      figure: true,
      imgLazyload: true,
      imgSize: true,
      include: true,
      // https://theme-hope.vuejs.press/zh/guide/markdown/stylize/mark.html
      mark: true,
      plantuml: true,
      spoiler: true,
      sub: true,
      sup: true,
      tabs: true,
      tasklist: true,
      gfm: true, // gfm requires mathjax-full
      mathjax: true,
      mermaid: true,
      // 在启用之前安装 katex
      // katex: true,
      // 在启用之前安装 chart.js
      // chart: true,
      // 在启用之前安装 echarts
      // echarts: true,
      // 在启用之前安装 flowchart.ts
      // flowchart: true,
    },

    feed: {
      atom: true,
      rss: true,
      json: true,
    },
  },
});
