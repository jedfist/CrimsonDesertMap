<script setup lang="ts">
import CrimsonDesertMap from '../components/CrimsonDesertMap.vue'
</script>

<template>
  <main class="map-page">
    <CrimsonDesertMap />
  </main>
</template>

<style scoped>
.map-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
