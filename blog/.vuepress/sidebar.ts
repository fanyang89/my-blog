import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/": [
    {
      text: "碎碎念",
      icon: "memory",
      link: "/memos.html",
    },
    {
      text: "收藏夹",
      icon: "bookmark",
      link: "/fav.html",
    },
    {
      text: "运维",
      icon: "network-wired",
      prefix: "devops/",
      children: "structure",
    },
    {
      text: "文章",
      icon: "book",
      prefix: "posts/",
      children: "structure",
    },
  ],
});
