import { sidebar } from "vuepress-theme-hope";

const common = [
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
];

export default sidebar({
  "/posts/": [
    ...common,
    {
      text: "文章",
      icon: "book",
      children: "structure",
    },
  ],
  "/devops/": [
    ...common,
    {
      text: "运维",
      icon: "network-wired",
      children: "structure",
    },
  ],
  "/": [
    ...common,
    {
      text: "文章",
      icon: "book",
      prefix: "posts/",
      children: "structure",
    },
  ],
});
