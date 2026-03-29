<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1 class="app__title">Crimson Desert Map</h1>
    </header>
    <div class="app__body">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.app__body {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app__header {
  flex-shrink: 0;
  padding: 0.65rem 1.25rem;
  border-bottom: 1px solid #2d2d32;
  background: #121214;
}

.app__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #e8e6e3;
  letter-spacing: 0.02em;
}
</style>
