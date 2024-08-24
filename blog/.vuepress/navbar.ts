import { navbar } from "vuepress-theme-hope";

export default navbar([
  {
    text: "文章",
    icon: "home",
    link: "/",
  },
  {
    text: "收藏夹",
    icon: "bookmark",
    link: "/fav.html",
  },
  {
    text: "服务",
    icon: "server",
    link: "/self-hosted.md",
  },
  {
    text: "关于",
    icon: "address-card",
    link: "/intro.html",
  },
]);
