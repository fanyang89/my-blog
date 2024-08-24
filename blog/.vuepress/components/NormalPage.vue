<template>
  <HopeNormalPage>
    <template #bottom>
      <SpeedInsights />
    </template>
  </HopeNormalPage>
</template>

<script setup lang="js">
import HopeNormalPage from "vuepress-theme-hope/components/NormalPage.js";
import { SpeedInsights } from "@vercel/speed-insights/vue";
import { inject } from '@vercel/analytics';

inject();
</script>
