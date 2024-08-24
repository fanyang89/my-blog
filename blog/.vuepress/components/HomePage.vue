<template>
  <HopeHomePage>
    <template #bottom>
      <SpeedInsights />
    </template>
  </HopeHomePage>
</template>

<script setup lang="js">
import HopeHomePage from "vuepress-theme-hope/components/HomePage.js";
import { SpeedInsights } from "@vercel/speed-insights/vue";
import { inject } from '@vercel/analytics';

inject();
</script>
