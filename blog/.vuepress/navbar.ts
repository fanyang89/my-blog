import { navbar } from "vuepress-theme-hope";

export default navbar([
  {
    text: "主页",
    icon: "home",
    link: "/",
  },
  {
    text: "时间线",
    icon: "timeline",
    link: "/timeline/",
  },
  {
    text: "文章",
    icon: "paper-plane",
    link: "/posts/",
  },
  {
    text: "运维",
    icon: "hand",
    link: "/devops/",
  },
  {
    text: "收藏夹",
    icon: "bookmark",
    link: "/fav.html",
  },
  {
    text: "碎碎念",
    icon: "memory",
    link: "/memos.html",
  },
  {
    text: "服务",
    icon: "server",
    link: "/self-hosted.html",
  },
  {
    text: "关于",
    icon: "address-card",
    link: "/about.html",
  },
]);
