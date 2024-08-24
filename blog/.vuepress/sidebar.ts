import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/": [
    {
      text: "收藏夹",
      icon: "bookmark",
      link: "/fav.html",
    },
    {
      text: "文章",
      icon: "book",
      prefix: "posts/",
      children: "structure",
    },
  ],
});
